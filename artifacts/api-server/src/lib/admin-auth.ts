import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const COOKIE_NAME = "sazon_admin";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function getSessionSecret(): string | undefined {
  return process.env.SESSION_SECRET;
}

export function constantTimeEqual(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(actual, "utf8");
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

function signatureFor(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function readCookie(req: Request): string | undefined {
  const header = req.header("cookie");
  if (!header) return undefined;

  const cookie = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));

  return cookie?.slice(COOKIE_NAME.length + 1);
}

export function isAdminSessionValid(req: Request): boolean {
  const secret = getSessionSecret();
  const rawCookie = readCookie(req);
  if (!secret || !rawCookie) return false;

  const [encodedPayload, signature, extra] = rawCookie.split(".");
  if (!encodedPayload || !signature || extra) return false;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  } catch {
    return false;
  }

  const [expiresAtText, nonce, trailing] = payload.split(".");
  if (!expiresAtText || !nonce || trailing) return false;

  const expectedSignature = signatureFor(payload, secret);
  if (!constantTimeEqual(expectedSignature, signature)) return false;

  const expiresAt = Number(expiresAtText);
  return Number.isSafeInteger(expiresAt) && expiresAt > Date.now();
}

export function issueAdminSession(res: Response): boolean {
  const secret = getSessionSecret();
  if (!secret) return false;

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${expiresAt}.${randomBytes(18).toString("base64url")}`;
  const encodedPayload = Buffer.from(payload).toString("base64url");
  const signature = signatureFor(payload, secret);

  res.cookie(COOKIE_NAME, `${encodedPayload}.${signature}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin",
    maxAge: SESSION_TTL_MS,
  });
  return true;
}

export function clearAdminSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/api/admin",
  });
}

export function requireAdminSession(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!isAdminSessionValid(req)) {
    res.status(401).json({ error: "Se requiere una sesión de administración." });
    return;
  }

  next();
}
