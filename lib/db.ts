import mongoose from "mongoose";

import { getServerEnv } from "@/lib/env";

declare global {
  var __mongooseConnectionPromise:
    | Promise<typeof mongoose>
    | undefined;
}

export async function connectToDatabase() {
  if (!global.__mongooseConnectionPromise) {
    global.__mongooseConnectionPromise = mongoose.connect(
      getServerEnv().mongodbUri,
      {
        bufferCommands: false,
      },
    );
  }

  return global.__mongooseConnectionPromise;
}
