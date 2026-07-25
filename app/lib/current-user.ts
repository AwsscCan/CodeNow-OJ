export class AuthRequiredError extends Error {
  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthRequiredError";
  }
}

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
};

type Session = { user: CurrentUser };
type GetSession = (headers: Headers) => Promise<Session | null>;

export function createUserReader(getSession: GetSession) {
  return {
    optional: async (headers: Headers) => (await getSession(headers))?.user ?? null,
    require: async (headers: Headers) => {
      const user = (await getSession(headers))?.user;
      if (!user) throw new AuthRequiredError();
      return user;
    },
  };
}
