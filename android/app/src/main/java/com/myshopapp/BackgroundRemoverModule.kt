package com.myshopapp

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableMap
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.Executors

class BackgroundRemoverModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val executor = Executors.newSingleThreadExecutor()

    override fun getName(): String {
        return "BackgroundRemover"
    }

    private fun getSegmenter(): SubjectSegmenter {
        val options = SubjectSegmenterOptions.Builder()
            .enableForegroundBitmap()
            .build()
        return SubjectSegmentation.getClient(options)
    }

    @ReactMethod
    fun isSupported(promise: Promise) {
        // ML Kit Subject Segmentation is supported on Android 7.0+ (API 24+)
        promise.resolve(android.os.Build.VERSION.SDK_INT >= 24)
    }

    @ReactMethod
    fun checkModelStatus(promise: Promise) {
        try {
            val segmenter = getSegmenter()
            val moduleInstallClient = ModuleInstall.getClient(reactContext)
            moduleInstallClient.areModulesAvailable(segmenter)
                .addOnSuccessListener { response ->
                    val map = Arguments.createMap().apply {
                        putBoolean("available", response.areModulesAvailable())
                    }
                    promise.resolve(map)
                }
                .addOnFailureListener { e ->
                    val map = Arguments.createMap().apply {
                        putBoolean("available", false)
                        putString("error", e.message)
                    }
                    promise.resolve(map)
                }
        } catch (e: Exception) {
            promise.reject("E_CHECK_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun downloadModel(promise: Promise) {
        try {
            val segmenter = getSegmenter()
            val moduleInstallClient = ModuleInstall.getClient(reactContext)
            val request = ModuleInstallRequest.newBuilder()
                .addApi(segmenter)
                .build()

            moduleInstallClient.installModules(request)
                .addOnSuccessListener { response ->
                    val map = Arguments.createMap().apply {
                        putBoolean("installed", true)
                        putBoolean("alreadyInstalled", response.areModulesAlreadyInstalled())
                    }
                    promise.resolve(map)
                }
                .addOnFailureListener { e ->
                    promise.reject("E_DOWNLOAD_FAILED", "Failed to download model: ${e.message}", e)
                }
        } catch (e: Exception) {
            promise.reject("E_DOWNLOAD_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun removeBackground(imageUriString: String, promise: Promise) {
        removeBackgroundWithOptions(imageUriString, null, promise)
    }

    @ReactMethod
    fun removeBackgroundWithOptions(imageUriString: String, options: ReadableMap?, promise: Promise) {
        executor.execute {
            try {
                if (imageUriString.isBlank()) {
                    promise.reject("E_INVALID_URI", "Image URI cannot be empty")
                    return@execute
                }

                val uri = if (imageUriString.startsWith("content://") || imageUriString.startsWith("file://")) {
                    Uri.parse(imageUriString)
                } else {
                    Uri.fromFile(File(imageUriString))
                }

                // 1. Load bitmap safely with orientation and downsampling if needed
                val (bitmap, rotationDegrees) = loadBitmapSafely(reactContext, uri, imageUriString, maxDimension = 2048)
                val inputImage = InputImage.fromBitmap(bitmap, rotationDegrees)

                // 2. Obtain segmenter client
                val segmenter = getSegmenter()
                val moduleInstallClient = ModuleInstall.getClient(reactContext)

                // 3. Ensure module is available before processing
                moduleInstallClient.areModulesAvailable(segmenter)
                    .addOnSuccessListener { availabilityResponse ->
                        if (!availabilityResponse.areModulesAvailable()) {
                            // Automatically request install and then process
                            val installRequest = ModuleInstallRequest.newBuilder()
                                .addApi(segmenter)
                                .build()

                            moduleInstallClient.installModules(installRequest)
                                .addOnSuccessListener {
                                    // Run segmentation now that module is installed
                                    processWithSegmenter(segmenter, inputImage, bitmap, options, promise)
                                }
                                .addOnFailureListener { e ->
                                    if (!bitmap.isRecycled) bitmap.recycle()
                                    promise.reject(
                                        "E_MODEL_DOWNLOAD_REQUIRED",
                                        "The ML Kit subject segmentation model needs to be downloaded via Google Play Services: ${e.message}",
                                        e
                                    )
                                }
                        } else {
                            // Module is already available, process immediately
                            processWithSegmenter(segmenter, inputImage, bitmap, options, promise)
                        }
                    }
                    .addOnFailureListener {
                        // Fallback: Attempt process directly (ML Kit may download automatically)
                        processWithSegmenter(segmenter, inputImage, bitmap, options, promise)
                    }

            } catch (e: Exception) {
                promise.reject("E_PROCESSING_FAILED", "Image processing failed: ${e.message}", e)
            }
        }
    }

    private fun findSubjectBounds(bitmap: Bitmap, alphaThreshold: Int = 20): Rect? {
        val width = bitmap.width
        val height = bitmap.height
        var minX = width
        var maxX = -1
        var minY = height
        var maxY = -1

        val rowPixels = IntArray(width)
        for (y in 0 until height) {
            bitmap.getPixels(rowPixels, 0, width, 0, y, width, 1)
            for (x in 0 until width) {
                if (Color.alpha(rowPixels[x]) > alphaThreshold) {
                    if (x < minX) minX = x
                    if (x > maxX) maxX = x
                    if (y < minY) minY = y
                    if (y > maxY) maxY = y
                }
            }
        }

        if (maxX < minX || maxY < minY) {
            return null
        }

        minX = maxOf(0, minX - 4)
        minY = maxOf(0, minY - 4)
        maxX = minOf(width - 1, maxX + 4)
        maxY = minOf(height - 1, maxY + 4)

        return Rect(minX, minY, maxX + 1, maxY + 1)
    }

    private fun processWithSegmenter(
        segmenter: SubjectSegmenter,
        inputImage: InputImage,
        inputBitmap: Bitmap,
        options: ReadableMap?,
        promise: Promise
    ) {
        segmenter.process(inputImage)
            .addOnSuccessListener { result ->
                try {
                    val foregroundBitmap = result.foregroundBitmap
                    if (foregroundBitmap == null) {
                        if (!inputBitmap.isRecycled) inputBitmap.recycle()
                        promise.reject("E_NO_SUBJECT", "No foreground product or subject could be isolated from this image.")
                        return@addOnSuccessListener
                    }

                    // 1. Detect tight bounding box of product
                    val bounds = findSubjectBounds(foregroundBitmap)
                    val productCrop = if (bounds != null && bounds.width() > 10 && bounds.height() > 10) {
                        Bitmap.createBitmap(foregroundBitmap, bounds.left, bounds.top, bounds.width(), bounds.height())
                    } else {
                        foregroundBitmap
                    }

                    val canvasSize = if (options != null && options.hasKey("outputSize")) {
                        options.getInt("outputSize")
                    } else {
                        1024
                    }

                    val paddingRatio = if (options != null && options.hasKey("padding")) {
                        options.getDouble("padding").toFloat().coerceIn(0.02f, 0.40f)
                    } else {
                        0.10f
                    }

                    val padding = canvasSize * paddingRatio
                    val availableSize = canvasSize - (padding * 2)

                    val scale = minOf(
                        availableSize / productCrop.width.toFloat(),
                        availableSize / productCrop.height.toFloat()
                    )

                    val scaledWidth = (productCrop.width * scale).toInt()
                    val scaledHeight = (productCrop.height * scale).toInt()

                    val destLeft = (canvasSize - scaledWidth) / 2f
                    val destTop = (canvasSize - scaledHeight) / 2f
                    val destRect = RectF(destLeft, destTop, destLeft + scaledWidth, destTop + scaledHeight)

                    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)

                    // 2. Generate Professional Studio Product Photography Image (Clean neutral/white background)
                    val studioBitmap = Bitmap.createBitmap(canvasSize, canvasSize, Bitmap.Config.ARGB_8888)
                    val studioCanvas = Canvas(studioBitmap)

                    val bgHex = if (options != null && options.hasKey("backgroundColor")) {
                        options.getString("backgroundColor") ?: "#FFFFFF"
                    } else {
                        "#FFFFFF"
                    }

                    val bgColor = try {
                        Color.parseColor(bgHex)
                    } catch (_: Exception) {
                        Color.WHITE
                    }
                    studioCanvas.drawColor(bgColor)
                    studioCanvas.drawBitmap(productCrop, null, destRect, paint)

                    // 3. Generate Transparent PNG Image (also centered on square canvas)
                    val transparentBitmap = Bitmap.createBitmap(canvasSize, canvasSize, Bitmap.Config.ARGB_8888)
                    val transCanvas = Canvas(transparentBitmap)
                    transCanvas.drawBitmap(productCrop, null, destRect, paint)

                    // 4. Save to cache
                    val cacheDir = reactContext.cacheDir
                    val timestamp = System.currentTimeMillis()
                    val randomId = (1000..9999).random()

                    val studioFile = File(cacheDir, "bg_studio_${timestamp}_${randomId}.jpg")
                    FileOutputStream(studioFile).use { out ->
                        studioBitmap.compress(Bitmap.CompressFormat.JPEG, 92, out)
                        out.flush()
                    }

                    val transparentFile = File(cacheDir, "bg_removed_${timestamp}_${randomId}.png")
                    FileOutputStream(transparentFile).use { out ->
                        transparentBitmap.compress(Bitmap.CompressFormat.PNG, 100, out)
                        out.flush()
                    }

                    val isTransparentMode = options?.getString("backgroundMode")?.equals("transparent", ignoreCase = true) == true
                    val primaryUri = if (isTransparentMode) {
                        Uri.fromFile(transparentFile).toString()
                    } else {
                        Uri.fromFile(studioFile).toString()
                    }

                    val map = Arguments.createMap().apply {
                        putString("uri", primaryUri)
                        putString("studioUri", Uri.fromFile(studioFile).toString())
                        putString("transparentUri", Uri.fromFile(transparentFile).toString())
                        putInt("width", canvasSize)
                        putInt("height", canvasSize)
                        putString("format", if (isTransparentMode) "png" else "jpg")
                        putBoolean("studioEnhanced", true)
                        putDouble("productAspectRatio", productCrop.width.toDouble() / productCrop.height.toDouble())
                    }

                    // Recycle bitmaps
                    if (productCrop != foregroundBitmap && !productCrop.isRecycled) {
                        productCrop.recycle()
                    }
                    if (foregroundBitmap != inputBitmap && !foregroundBitmap.isRecycled) {
                        foregroundBitmap.recycle()
                    }
                    if (!inputBitmap.isRecycled) inputBitmap.recycle()
                    if (!studioBitmap.isRecycled) studioBitmap.recycle()
                    if (!transparentBitmap.isRecycled) transparentBitmap.recycle()

                    promise.resolve(map)
                } catch (e: Exception) {
                    if (!inputBitmap.isRecycled) inputBitmap.recycle()
                    promise.reject("E_SAVE_FAILED", "Failed to process and save product image: ${e.message}", e)
                }
            }
            .addOnFailureListener { e ->
                if (!inputBitmap.isRecycled) inputBitmap.recycle()
                promise.reject("E_SEGMENTATION_FAILED", "Segmentation failed: ${e.message}", e)
            }
    }

    private fun resolveLocalFile(uri: Uri, rawUriString: String): File? {
        val scheme = uri.scheme
        if (scheme == null || scheme.equals("file", ignoreCase = true)) {
            val path = uri.path
            if (!path.isNullOrBlank()) {
                val file = File(path)
                if (file.exists()) return file
            }
            val cleanedRaw = rawUriString.removePrefix("file://")
            val rawFile = File(cleanedRaw)
            if (rawFile.exists()) return rawFile
        }
        val directFile = File(rawUriString)
        if (directFile.exists()) return directFile
        return null
    }

    private fun openInputStreamForUri(context: Context, uri: Uri, rawUriString: String): InputStream {
        val localFile = resolveLocalFile(uri, rawUriString)
        if (localFile != null && localFile.exists()) {
            return FileInputStream(localFile)
        }
        return context.contentResolver.openInputStream(uri)
            ?: throw IOException("Could not open input stream for: $uri")
    }

    private fun loadBitmapSafely(context: Context, uri: Uri, rawUriString: String, maxDimension: Int): Pair<Bitmap, Int> {
        val localFile = resolveLocalFile(uri, rawUriString)

        // 1. Check bounds
        val boundsOptions = BitmapFactory.Options().apply {
            inJustDecodeBounds = true
        }

        if (localFile != null && localFile.exists()) {
            BitmapFactory.decodeFile(localFile.absolutePath, boundsOptions)
        } else {
            openInputStreamForUri(context, uri, rawUriString).use { stream ->
                BitmapFactory.decodeStream(stream, null, boundsOptions)
            }
        }

        val origWidth = boundsOptions.outWidth
        val origHeight = boundsOptions.outHeight
        if (origWidth <= 0 || origHeight <= 0) {
            throw IOException("Invalid image dimensions: ${origWidth}x${origHeight}")
        }

        // 2. Compute sample size
        var sampleSize = 1
        if (origWidth > maxDimension || origHeight > maxDimension) {
            val halfHeight = origHeight / 2
            val halfWidth = origWidth / 2
            while ((halfHeight / sampleSize) >= maxDimension || (halfWidth / sampleSize) >= maxDimension) {
                sampleSize *= 2
            }
        }

        val decodeOptions = BitmapFactory.Options().apply {
            inSampleSize = sampleSize
            inPreferredConfig = Bitmap.Config.ARGB_8888
        }

        // 3. Decode bitmap
        val decodedBitmap = if (localFile != null && localFile.exists()) {
            BitmapFactory.decodeFile(localFile.absolutePath, decodeOptions)
                ?: throw IOException("Failed to decode bitmap from file: ${localFile.absolutePath}")
        } else {
            openInputStreamForUri(context, uri, rawUriString).use { stream ->
                BitmapFactory.decodeStream(stream, null, decodeOptions)
            } ?: throw IOException("Failed to decode bitmap from URI: $uri")
        }

        // 4. Read EXIF orientation
        var rotationDegrees = 0
        try {
            val exif = if (localFile != null && localFile.exists()) {
                ExifInterface(localFile.absolutePath)
            } else {
                openInputStreamForUri(context, uri, rawUriString).use { stream ->
                    ExifInterface(stream)
                }
            }
            rotationDegrees = when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
                ExifInterface.ORIENTATION_ROTATE_90 -> 90
                ExifInterface.ORIENTATION_ROTATE_180 -> 180
                ExifInterface.ORIENTATION_ROTATE_270 -> 270
                else -> 0
            }
        } catch (_: Exception) {
            rotationDegrees = 0
        }

        return Pair(decodedBitmap, rotationDegrees)
    }

    @ReactMethod
    fun cleanupTempFiles(promise: Promise) {
        executor.execute {
            try {
                val cacheDir = reactContext.cacheDir
                val files = cacheDir.listFiles { _, name -> name.startsWith("bg_removed_") || name.startsWith("bg_studio_") }
                var deletedCount = 0
                val now = System.currentTimeMillis()
                files?.forEach { file ->
                    // Delete temporary transparent and studio images older than 1 hour
                    if (now - file.lastModified() > 3600000) {
                        if (file.delete()) deletedCount++
                    }
                }
                promise.resolve(deletedCount)
            } catch (e: Exception) {
                promise.resolve(0)
            }
        }
    }
}
