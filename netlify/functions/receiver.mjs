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

    const form = await request.formData();
    const image = form.get("image");

    if (!image || typeof image === "string") {
      return Response.json(
        { status: "error", message: "Missing image field" },
        { status: 400 }
      );
    }

    return Response.json({
      status: "success",
      message: "Image received by Netlify",
      filename: image.name,
      content_type: image.type,
      size_bytes: image.size
    });

  } catch (error) {
    return Response.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }
};
