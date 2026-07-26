import { getRuntimeServices } from "../../../lib/auth";
import { guardAuthRequest } from "../../../server/security/auth-rate-limit";

async function handle(request: Request) {
  const services = await getRuntimeServices(request);
  const rejected = await guardAuthRequest(services.db, request, services.rateLimitPepper);
  if (rejected) return rejected;
  const response = await services.auth.handler(request);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export { handle as GET, handle as POST };
