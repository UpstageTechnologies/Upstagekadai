import Foundation
import AudioToolbox
import AVFoundation

@objc(ScanBeep)
class ScanBeep: NSObject {
  private var audioPlayer: AVAudioPlayer?

  @objc
  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc
  func beep() {
    AudioServicesPlaySystemSound(1057)
  }

  @objc
  func playPaymentSuccess() {
    if let soundURL = Bundle.main.url(forResource: "pos_payment_success", withExtension: "wav") {
      do {
        audioPlayer = try AVAudioPlayer(contentsOf: soundURL)
        audioPlayer?.prepareToPlay()
        audioPlayer?.play()
        return
      } catch {
        print("Failed to play pos_payment_success: \(error)")
      }
    }
    AudioServicesPlaySystemSound(1054)
  }
}
