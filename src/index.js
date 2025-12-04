const getPrivateKeyBuffer = (keyString) => {
  if (!keyString) {
    throw new Error("GOOGLE_PRIVATE_KEY is not configured");
  }

  const normalizedKey = keyString.replace(/\r/g, "").replace(/\\n/g, "\n");
  const base64Key = normalizedKey
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");

  const binaryKey = atob(base64Key);
  const keyBytes = new Uint8Array(binaryKey.length);
  for (let i = 0; i < binaryKey.length; i += 1) {
    keyBytes[i] = binaryKey.charCodeAt(i);
  }

  return keyBytes.buffer;
};

const base64UrlEncode = (data) =>
  btoa(String.fromCharCode(...new Uint8Array(data)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

const createJwt = async (env) => {
  if (!env?.GOOGLE_CLIENT_EMAIL) {
    throw new Error("GOOGLE_CLIENT_EMAIL is not configured");
  }

  const iat = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const payload = {
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: iat + 3600,
    iat,
  };

  const enc = new TextEncoder();
  const encodedHeader = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const message = `${encodedHeader}.${encodedPayload}`;

  const keyData = getPrivateKeyBuffer(env.GOOGLE_PRIVATE_KEY);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    enc.encode(message)
  );

  const encodedSignature = base64UrlEncode(signature);
  return `${message}.${encodedSignature}`;
};

const getAccessToken = async (env) => {
  const assertion = await createJwt(env);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    throw new Error(
      `Failed to obtain access token: ${tokenResponse.status} ${errorText}`
    );
  }

  const tokenJson = await tokenResponse.json();
  return tokenJson.access_token;
};

const appendLogRow = async (request, env, accessToken) => {
  if (!env?.SHEET_ID || !env?.SHEET_NAME) {
    throw new Error("SHEET_ID or SHEET_NAME is not configured");
  }

  const values = [
    [new Date().toISOString(), request.method, request.url],
  ];

  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${env.SHEET_ID}/values/${encodeURIComponent(
    env.SHEET_NAME
  )}!A1:append?valueInputOption=RAW`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values,
      majorDimension: "ROWS",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to append row: ${response.status} ${errorText}`
    );
  }
};

const logToGoogleSheet = async (request, env) => {
  try {
    const accessToken = await getAccessToken(env);
    await appendLogRow(request, env, accessToken);
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
