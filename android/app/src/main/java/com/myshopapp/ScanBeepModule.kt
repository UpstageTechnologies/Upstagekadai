package com.myshopapp

import android.media.AudioAttributes
import android.media.SoundPool
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class ScanBeepModule(
    reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    private val soundPool: SoundPool
    private var beepSoundId: Int = 0
    private var isLoaded = false

    init {
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        soundPool = SoundPool.Builder()
            .setMaxStreams(1)
            .setAudioAttributes(audioAttributes)
            .build()

        soundPool.setOnLoadCompleteListener { _, sampleId, status ->
            if (status == 0 && sampleId == beepSoundId) {
                isLoaded = true
            }
        }

        val resourceId = reactContext.resources.getIdentifier(
            "pos_scan_beep",
            "raw",
            reactContext.packageName
        )

        if (resourceId != 0) {
            beepSoundId = soundPool.load(
                reactContext,
                resourceId,
                1
            )
        }
    }

    @ReactMethod
    fun beep() {
        if (!isLoaded || beepSoundId == 0) {
            return
        }

        soundPool.play(
            beepSoundId,
            1.0f,
            1.0f,
            1,
            0,
            1.0f
        )
    }

    override fun getName(): String {
        return "ScanBeep"
    }

    override fun invalidate() {
        soundPool.release()
        super.invalidate()
    }
}
