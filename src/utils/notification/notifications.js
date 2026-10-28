import notifee, {
  AndroidImportance,
} from "@notifee/react-native";

export const PENDING_NOTIFICATION_PRESS_KEY = "pending_notification_press";

export async function createNotificationChannel() {
  try {
    const channelId = await notifee.createChannel({
    id: "orders_channel",
name: "Orders",
      importance: AndroidImportance.HIGH,
      sound: "default",
    });

    console.log(
      "✅ NOTIFICATION CHANNEL:",
      channelId
    );

    return channelId;
  } catch (error) {
    console.log(
      "❌ CHANNEL ERROR:",
      error
    );

    return null;
  }
}

export async function displayNotification({
  title,
  body,
  orderId = "",
  status = "",
  screen = "",
  messageId = "",
}) {
  try {
    await notifee.displayNotification({
      title,
      body,

      data: {
        orderId: String(orderId || ""),
        status: String(status || ""),
        screen: String(screen || ""),
        ...(messageId ? { messageId: String(messageId) } : {}),
      },

      android: {
channelId: "orders_channel",
        smallIcon: "ic_launcher",

        pressAction: {
          id: "default",
        },
      },
    });

    console.log(
      "✅ NOTIFICATION DISPLAYED"
    );

    console.log(
      "🧾 ORDER ID:",
      orderId
    );

    console.log(
      "📱 SCREEN:",
      screen
    );

  } catch (error) {
    console.log(
      "❌ NOTIFICATION DISPLAY ERROR:",
      error
    );
  }
}
