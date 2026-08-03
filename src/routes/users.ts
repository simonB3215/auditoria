import { Router } from "express";
import { authenticateToken } from "../middlewares/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const usersRouter = Router();

usersRouter.get(
  "/users/me",
  authenticateToken,
  asyncHandler(async (req, res) => {
    res.status(200).json({ data: req.profile });
  })
);
