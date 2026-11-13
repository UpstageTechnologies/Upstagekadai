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
    private var successSoundId: Int = 0
    private var isBeepLoaded = false
    private var isSuccessLoaded = false

    init {
        val audioAttributes = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()

        soundPool = SoundPool.Builder()
            .setMaxStreams(3)
            .setAudioAttributes(audioAttributes)
            .build()

        soundPool.setOnLoadCompleteListener { _, sampleId, status ->
            if (status == 0) {
                if (sampleId == beepSoundId) {
                    isBeepLoaded = true
                } else if (sampleId == successSoundId) {
                    isSuccessLoaded = true
                }
            }
        }

        val beepResId = reactContext.resources.getIdentifier(
            "pos_scan_beep",
            "raw",
            reactContext.packageName
        )
        if (beepResId != 0) {
            beepSoundId = soundPool.load(reactContext, beepResId, 1)
        }

        val successResId = reactContext.resources.getIdentifier(
            "pos_payment_success",
            "raw",
            reactContext.packageName
        )
        if (successResId != 0) {
            successSoundId = soundPool.load(reactContext, successResId, 1)
        }
    }

    @ReactMethod
    fun beep() {
        if (!isBeepLoaded || beepSoundId == 0) {
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

    @ReactMethod
    fun playPaymentSuccess() {
        if (!isSuccessLoaded || successSoundId == 0) {
            return
        }

        soundPool.play(
            successSoundId,
            1.0f,
            1.0f,
            2,
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
