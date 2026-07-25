import { getRuntimeAuth } from "../../../lib/auth";

async function handle(request: Request) {
  const auth = await getRuntimeAuth(request);
  return auth.handler(request);
}

export { handle as GET, handle as POST };
