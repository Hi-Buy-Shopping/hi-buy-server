import fetch from 'node-fetch'

export async function sendPushNotification(expoPushToken, orderId) {
  const message = {
    to: expoPushToken,
    sound: 'default',
    title: 'New Order Received',
    body: `You have a new order! Order ID: ${orderId}`,
    data: { orderId },
  };

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });
}
