
import jsQR from "jsqr";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

export default async (request) => {
  try {
    if (request.method === "GET") {
      return Response.json({
        status: "online",
        service: "RunningHub QR Receiver",
        decoder: "Local JavaScript QR decoder"
      });
    }

    if (request.method !== "POST") {
      return Response.json(
        { status: "error", message: "POST required" },
        { status: 405 }
      );
    }

    // Authenticate request
    const url = new URL(request.url);

    if (
      !process.env.UPLOAD_TOKEN ||
      url.searchParams.get("token") !== process.env.UPLOAD_TOKEN
    ) {
      return Response.json(
        { status: "error", message: "Unauthorized" },
        { status: 401 }
      );
    }

    // Read optional Google Sheets row number
    const rowParam = url.searchParams.get("row");
    let row = null;

    if (rowParam !== null) {
      row = Number(rowParam);

      if (!Number.isInteger(row) || row < 8) {
        return Response.json(
          { status: "error", message: "Invalid task row number" },
          { status: 400 }
        );
      }
    }

    // Receive uploaded image
    const form = await request.formData();
    const image = form.get("image");

    if (!image || typeof image === "string") {
      throw new Error("Missing image field");
    }

    if (image.size > 10 * 1024 * 1024) {
      throw new Error("Image exceeds 10 MB");
    }

    const buffer = Buffer.from(await image.arrayBuffer());

    // Identify image by actual file signature
    let decodedImage;

    const isPNG =
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47;

    const isJPEG =
      buffer.length >= 3 &&
      buffer[0] === 0xFF &&
      buffer[1] === 0xD8 &&
      buffer[2] === 0xFF;

    if (isPNG) {
      const png = PNG.sync.read(buffer);

      decodedImage = {
        data: new Uint8ClampedArray(png.data),
        width: png.width,
        height: png.height
      };

    } else if (isJPEG) {
      const jpg = jpeg.decode(buffer, {
        useTArray: true
      });

      decodedImage = {
        data: new Uint8ClampedArray(jpg.data),
        width: jpg.width,
        height: jpg.height
      };

    } else {
      throw new Error(
        "Unsupported image data. Please use PNG or JPEG."
      );
    }

    // Decode QR locally
    const qr = jsQR(
      decodedImage.data,
      decodedImage.width,
      decodedImage.height,
      {
        inversionAttempts: "attemptBoth"
      }
    );

    if (!qr || !qr.data) {
      throw new Error(
        "No QR code detected. Check QR image quality and size."
      );
    }

    const message = qr.data;

    // Google Apps Script configuration
    if (
      !process.env.SHEETS_WEB_APP_URL ||
      !process.env.SHEETS_SECRET
    ) {
      throw new Error(
        "Google Sheets environment variables missing"
      );
    }

    // Forward decoded result
    const payload = {
      secret: String(process.env.SHEETS_SECRET || "").trim(),
      message: message,
      source: "RunningHub",
      sheetName: row !== null
        ? "RH_2124789792373309441"
        : undefined,
      row: row
    };

    const sheetsResponse = await fetch(
      process.env.SHEETS_WEB_APP_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const sheetsText = await sheetsResponse.text();

    if (!sheetsResponse.ok) {
      throw new Error(
        "Google Apps Script HTTP " +
        sheetsResponse.status +
        ": " + sheetsText
      );
    }

    let sheetsResult;

    try {
      sheetsResult = JSON.parse(sheetsText);
    } catch {
      throw new Error(
        "Invalid Google Apps Script response: " +
        sheetsText
      );
    }

    if (sheetsResult.status !== "success") {
      throw new Error(
        sheetsResult.message ||
        "Google Sheets update failed"
      );
    }

    return Response.json({
      status: "success",
      decoded_message: message,
      row: row,
      sheet: payload.sheetName || "Legacy RunningHub",
      image_width: decodedImage.width,
      image_height: decodedImage.height,
      decoder: "Local JavaScript",
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
