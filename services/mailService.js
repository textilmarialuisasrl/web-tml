const RESEND_API_URL = "https://api.resend.com/emails";

function getMailConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  const to = process.env.MAIL_TO;

  if (!apiKey || !from || !to) {
    throw new Error("Mail service not configured");
  }

  return { apiKey, from, to };
}

async function sendQuotationEmail({ subject, html }) {
  const { apiKey, from, to } = getMailConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const resendMessage =
        typeof data?.message === "string" ? data.message : "Email API error";
      throw new Error(resendMessage);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  sendQuotationEmail,
};
