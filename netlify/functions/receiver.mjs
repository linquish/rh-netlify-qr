
export default async (request) => {
  try {
    if (request.method === "GET") {
      return Response.json({
        status: "online",
        service: "RunningHub QR Receiver"
      });
    }

    if (request.method !== "POST") {
      return Response.json(
        { status: "error", message: "POST required" },
        { status: 405 }
      );
    }

    // Authenticate using URL token
    const url = new URL(request.url);

    if (url.searchParams.get("token") !== process.env.UPLOAD_TOKEN) {
      return Response.json(
        { status: "error", message: "Unauthorized" },
        { status: 401 }
      );
    }

    // Receive uploaded QR image
    const form = await request.formData();
    const image = form.get("image");

    if (!image || typeof image === "string") {
      throw new Error("Missing image field");
    }

    if (image.size > 1048576) {
      throw new Error("Image exceeds 1 MB");
    }

    if (!["image/png", "image/jpeg", "image/gif"].includes(image.type)) {
      throw new Error("Unsupported image format: " + image.type);
    }

    // Send image to QR decoder
    const decoderForm = new FormData();
    decoderForm.append("file", image, "runninghub.png");
    decoderForm.append("outputformat", "json");

    const decoderResponse = await fetch(
      "https://api.qrserver.com/v1/read-qr-code/",
      {
        method: "POST",
        body: decoderForm
      }
    );

    if (!decoderResponse.ok) {
      throw new Error("QR decoder HTTP " + decoderResponse.status);
    }

    const decoded = await decoderResponse.json();

    const symbol = decoded?.[0]?.symbol?.[0];
    const message = symbol?.data;

    if (!message) {
      throw new Error(symbol?.error || "No QR code found");
    }

    // Forward decoded text to Google Sheets
    const sheetsResponse = await fetch(
      process.env.SHEETS_WEB_APP_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          secret: process.env.SHEETS_SECRET,
          message: message,
          source: "RunningHub"
        })
      }
    );

    const sheetsText = await sheetsResponse.text();

    if (!sheetsResponse.ok) {
      throw new Error(
        "Google Apps Script HTTP " +
        sheetsResponse.status + ": " + sheetsText
      );
    }

    let sheetsResult;

    try {
      sheetsResult = JSON.parse(sheetsText);
    } catch {
      throw new Error("Invalid Google Apps Script response: " + sheetsText);
    }

    if (sheetsResult.status !== "success") {
      throw new Error(
        sheetsResult.message || "Google Sheets update failed"
      );
    }

    return Response.json({
      status: "success",
      decoded_message: message,
      sheets: "updated"
    });

  } catch (error) {
    return Response.json(
      {
        status: "error",
        message: error.message || String(error)
      },
      { status: 500 }
    );
  }
};
