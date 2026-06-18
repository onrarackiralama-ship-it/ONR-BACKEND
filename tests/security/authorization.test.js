// tests/security/authorization.test.js
// Unit tests for `authorizeAdminRoute` — the per-resource authorization guard that
// closes the authentication-vs-authorization gap on admin routes (security fix B1/B2).
// Previously admin routes only checked for a valid token (`protect`), so any admin
// — including low-privilege roles — could call any endpoint (incl. DELETE).
//
// The Admin model is mocked so requiring the middleware doesn't pull in Sequelize;
// authorizeAdminRoute never touches the model (it reads req.admin, which we inject).
jest.mock("../../src/models/Admin", () => ({}));

const request = require("supertest");
const express = require("express");
const { authorizeAdminRoute } = require("../../src/middleware/auth");

// Mirrors Admin.getDefaultPermissions (src/models/Admin.js) so the test reflects the
// real role -> permission mapping. super_admin is handled by role short-circuit.
const PERMISSION_SETS = {
  admin: [
    { module: "cars", actions: ["create", "read", "update", "delete"] },
    { module: "locations", actions: ["create", "read", "update", "delete"] },
    { module: "bookings", actions: ["create", "read", "update", "delete"] },
    { module: "content", actions: ["create", "read", "update", "delete"] },
  ],
  manager: [
    { module: "cars", actions: ["read", "update"] },
    { module: "locations", actions: ["read", "update"] },
    { module: "bookings", actions: ["read", "update"] },
    { module: "content", actions: ["read", "update"] },
  ],
  editor: [
    { module: "content", actions: ["create", "read", "update"] },
    { module: "cars", actions: ["read"] },
    { module: "bookings", actions: ["read"] },
  ],
};

// Mirrors Admin.prototype.hasPermission (src/models/Admin.js).
function hasPermission(module, action) {
  if (this.role === "super_admin") return true;
  if (!Array.isArray(this.permissions)) return false;
  const mp = this.permissions.find((p) => p.module === module);
  return !!(mp && mp.actions && mp.actions.includes(action));
}

function makeAdmin(role) {
  return { role, permissions: PERMISSION_SETS[role] || [], hasPermission };
}

// Mirrors production wiring: protect (omitted here) sets req.admin, then the guard
// runs, then the (any) handler responds 200 if authorization passed.
function buildApp(admin) {
  const app = express();
  app.use(express.json());
  if (admin) {
    app.use((req, _res, next) => {
      req.admin = admin;
      next();
    });
  }
  app.use("/api/admin", authorizeAdminRoute);
  app.all("/api/admin/*", (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

describe("authorizeAdminRoute (per-resource admin authorization)", () => {
  it("rejects when no admin is attached (401)", async () => {
    const res = await request(buildApp(null)).get("/api/admin/cars");
    expect(res.status).toBe(401);
  });

  describe("super_admin", () => {
    const app = () => buildApp(makeAdmin("super_admin"));
    it("is allowed on every resource and method", async () => {
      await request(app()).get("/api/admin/cars").expect(200);
      await request(app()).delete("/api/admin/cars/123").expect(200);
      await request(app()).put("/api/admin/exchange-rates").expect(200);
      await request(app()).post("/api/admin/bookings").expect(200);
    });
  });

  describe("manager (cars/bookings/content: read + update only)", () => {
    const app = () => buildApp(makeAdmin("manager"));
    it("allows a read it has", () => request(app()).get("/api/admin/cars").expect(200));
    it("allows an update it has", () => request(app()).put("/api/admin/cars/123").expect(200));
    it("blocks a create it lacks (403)", () => request(app()).post("/api/admin/cars").expect(403));
    it("blocks a delete it lacks (403)", () => request(app()).delete("/api/admin/cars/123").expect(403));
    it("blocks the settings module (exchange-rates) entirely (403)", async () => {
      await request(app()).get("/api/admin/exchange-rates").expect(403);
      await request(app()).put("/api/admin/exchange-rates").expect(403);
    });
  });

  describe("editor (content CRU; read-only cars/bookings)", () => {
    const app = () => buildApp(makeAdmin("editor"));
    it("allows content read + create (news -> content)", async () => {
      await request(app()).get("/api/admin/news").expect(200);
      await request(app()).post("/api/admin/news").expect(200);
    });
    it("blocks content delete it lacks (403)", () => request(app()).delete("/api/admin/news/123").expect(403));
    it("blocks car create (read-only) (403)", () => request(app()).post("/api/admin/cars").expect(403));
    it("allows blog read but blocks blog delete (blogs -> content)", async () => {
      await request(app()).get("/api/admin/blogs").expect(200);
      await request(app()).delete("/api/admin/blogs/1").expect(403);
    });
  });

  it("fails closed: denies unmapped resources even for the admin role (403)", () =>
    request(buildApp(makeAdmin("admin"))).get("/api/admin/secrets").expect(403));
});
