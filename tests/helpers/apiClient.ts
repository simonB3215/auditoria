import request from "supertest";
import { createApp } from "../../src/app.js";

export const api = request(createApp());

export function bearer(accessToken: string): string {
  return `Bearer ${accessToken}`;
}
