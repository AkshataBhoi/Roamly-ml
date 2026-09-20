import { NextRequest, NextResponse } from "next/server";
import { reverseGeocode } from "@/backend/src/services/osm.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");

    if (!lat || !lng) {
      return NextResponse.json(
        { error: "Latitude and longitude query parameters are required" },
        { status: 400 }
      );
    }

    const numLat = parseFloat(lat);
    const numLng = parseFloat(lng);

    if (
      isNaN(numLat) ||
      isNaN(numLng) ||
      numLat < -90 ||
      numLat > 90 ||
      numLng < -180 ||
      numLng > 180
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid coordinates. Latitude must be between -90 and 90, and longitude between -180 and 180.",
        },
        { status: 400 }
      );
    }

    const address = await reverseGeocode(numLat, numLng);

    if (address) {
      return NextResponse.json({ address });
    } else {
      return NextResponse.json(
        {
          error:
            "Unable to pinpoint selected geolocation. Please enter a valid address manually.",
        },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Reverse geocoding API route error:", error?.message || error);
    if (
      error?.isUpstream ||
      error?.code === "ECONNABORTED" ||
      error?.code === "ETIMEDOUT" ||
      error?.code === "ENOTFOUND" ||
      (error?.status && error.status >= 500)
    ) {
      return NextResponse.json(
        {
          error:
            "Reverse geolocation service is temporarily unavailable. Please try again later.",
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      {
        error:
          "Unable to pinpoint selected geolocation. Please enter a valid address manually.",
      },
      { status: 400 }
    );
  }
}
