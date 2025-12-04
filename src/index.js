const logToGoogleSheet = async (request, env) => {
  const endpoint = env?.GOOGLE_SHEETS_LOG_URL;
  if (!endpoint) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    method: request.method,
    url: request.url,
  };

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error("Failed to log request to Google Sheets", error);
  }
};

export default {
  async fetch(request, env, ctx) {
    ctx.waitUntil(logToGoogleSheet(request, env));

    return new Response("Hello from Cloudflare Worker! 👋");
  },
};
