import { NextResponse } from "next/server";

export async function GET() {
  const keyA = process.env.OPENAI_API_KEY;
  const keyB = process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  const resolved = keyA ?? keyB;

  const mask = (k: string | undefined) => {
    if (!k) return null;
    return `${k.slice(0, 10)}...${k.slice(-4)} (len=${k.length})`;
  };

  return NextResponse.json({
    env_file_location: `${process.cwd()}/.env.local`,
    cwd: process.cwd(),
    OPENAI_API_KEY: { set: !!keyA, preview: mask(keyA) },
    NEXT_PUBLIC_OPENAI_API_KEY: { set: !!keyB, preview: mask(keyB) },
    resolved_key: { set: !!resolved, preview: mask(resolved) },
    node_env: process.env.NODE_ENV,
  });
}
