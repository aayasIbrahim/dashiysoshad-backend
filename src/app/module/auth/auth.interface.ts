import type { Role } from "../../../generated/prisma/browser";

export interface ILoginUserPayload {
  email: string;
  password: string;
}

export interface IRegisterPayload {
  name: string;
  email: string;
  password: string;
  phone: string;
}

export interface IRequestUser {
  userId: string;
  email: string;
  name: string;
  role: Role;
}
