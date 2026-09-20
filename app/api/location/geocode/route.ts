import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/backend/src/services/osm.service";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");

    if (!address || !address.trim()) {
      return NextResponse.json(
        { error: "Address query parameter is required" },
        { status: 400 }
      );
    }

    const result = await geocodeAddress(address.trim());

    if (result) {
      return NextResponse.json({
        latitude: parseFloat(result.lat),
        longitude: parseFloat(result.lon),
        address: result.display_name,
      });
    } else {
      return NextResponse.json(
        { error: "Unable to pinpoint selected geolocation. Please enter a valid address manually." },
        { status: 400 }
      );
    }
  } catch (error: any) {
    console.error("Geocoding API route error:", error?.message || error);
    if (
      error?.isUpstream ||
      error?.code === "ECONNABORTED" ||
      error?.code === "ETIMEDOUT" ||
      error?.code === "ENOTFOUND" ||
      (error?.status && error.status >= 500)
    ) {
      return NextResponse.json(
        { error: "Geolocation service is temporarily unavailable. Please try again later." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: "Unable to pinpoint selected geolocation. Please enter a valid address manually." },
      { status: 400 }
    );
  }
}
