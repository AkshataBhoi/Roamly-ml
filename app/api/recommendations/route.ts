import { NextRequest, NextResponse } from "next/server";
import { getRecommendations } from "@/backend/src/controllers/recommendation.controller";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    return await new Promise<NextResponse>((resolve) => {
      const mockReq: any = {
        body,
      };

      const mockRes: any = {
        statusCode: 200,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(data: any) {
          resolve(NextResponse.json(data, { status: this.statusCode }));
          return this;
        },
      };

      getRecommendations(mockReq, mockRes).catch((err: any) => {
        console.error("Unhandled error in getRecommendations:", err?.message || err);
        if (
          err?.isUpstream ||
          err?.code === "ECONNABORTED" ||
          err?.code === "ETIMEDOUT" ||
          err?.code === "ENOTFOUND" ||
          (err?.status && err.status >= 500)
        ) {
          resolve(
            NextResponse.json(
              {
                error:
                  "The OpenStreetMap Overpass service timed out or is temporarily unreachable. Please try again in a few moments.",
              },
              { status: 503 }
            )
          );
        } else {
          resolve(
            NextResponse.json(
              {
                error:
                  "An unexpected error occurred while retrieving recommendations. Please try again.",
              },
              { status: 500 }
            )
          );
        }
      });
    });
  } catch (error: any) {
    console.error("Recommendations API route fatal error:", error?.message || error);
    return NextResponse.json(
      {
        error:
          "An unexpected error occurred while retrieving recommendations. Please try again.",
      },
      { status: 500 }
    );
  }
}
