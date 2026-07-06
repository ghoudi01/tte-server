type QuickReply = { content_type: "text"; title: string; payload: string };

export async function graphSendMessage(
  pageAccessToken: string,
  recipientPsid: string,
  message: {
    text?: string;
    quick_replies?: QuickReply[];
    attachment?: {
      type: "template";
      payload: Record<string, unknown>;
    };
  }
): Promise<boolean> {
  const url = new URL("https://graph.facebook.com/v18.0/me/messages");
  url.searchParams.set("access_token", pageAccessToken);
  const body: Record<string, unknown> = {
    recipient: { id: recipientPsid },
    messaging_type: "RESPONSE",
    message,
  };
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[meta-graph] API error ${res.status}: ${text}`);
  }
  return res.ok;
}

export async function graphSendText(
  pageAccessToken: string,
  recipientPsid: string,
  text: string,
  quickReplies?: QuickReply[]
): Promise<boolean> {
  const message: {
    text: string;
    quick_replies?: QuickReply[];
  } = { text };
  if (quickReplies && quickReplies.length > 0) {
    message.quick_replies = quickReplies.slice(0, 13);
  }
  return graphSendMessage(pageAccessToken, recipientPsid, message);
}

export async function graphSendCarousel(
  pageAccessToken: string,
  recipientPsid: string,
  elements: {
    title: string;
    subtitle?: string;
    image_url?: string;
    buttons: { type: string; title: string; payload?: string; url?: string }[];
  }[],
  quickReplies?: QuickReply[]
): Promise<boolean> {
  const message: {
    attachment: {
      type: "template";
      payload: {
        template_type: "generic";
        elements: typeof elements;
      };
    };
    quick_replies?: QuickReply[];
  } = {
    attachment: {
      type: "template",
      payload: {
        template_type: "generic",
        elements: elements.slice(0, 10),
      },
    },
  };
  if (quickReplies && quickReplies.length > 0) {
    message.quick_replies = quickReplies.slice(0, 13);
  }
  return graphSendMessage(pageAccessToken, recipientPsid, message);
}
