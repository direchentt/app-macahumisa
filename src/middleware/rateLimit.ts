import rateLimit from "express-rate-limit";

export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 8,
  message: { error: "Demasiados registros desde esta IP. Probá en una hora." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Demasiados intentos de inicio de sesión. Probá en 15 minutos." },
  standardHeaders: true,
  legacyHeaders: false,
});
