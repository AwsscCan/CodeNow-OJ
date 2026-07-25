export function createAuthOptions(input: { baseURL: string; secret: string }) {
  return {
    baseURL: input.baseURL,
    secret: input.secret,
    emailAndPassword: {
      enabled: true as const,
      requireEmailVerification: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
    },
  };
}
