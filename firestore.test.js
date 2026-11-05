const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ADMIN_UID = "admin_uid_123";
const DRIVER_UID = "driver_uid_456";
const STRANGER_UID = "stranger_uid_789";

const [emulatorHost, emulatorPortStr] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

test("Unauthenticated user: cannot read trips", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("trips").get());
});

test("Driver: can query only own trips", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("trips").doc("trip1").set({
      id: "trip1",
      tripNumber: "SFR-001",
      vehicleId: "v1",
      driverId: DRIVER_UID,
      tripType: "LOADED",
      startKm: 100000,
      status: "ACTIVE",
      createdAt: new Date(),
    });
    await context.firestore().collection("trips").doc("trip2").set({
      id: "trip2",
      tripNumber: "SFR-002",
      vehicleId: "v2",
      driverId: "other_driver",
      tripType: "LOADED",
      startKm: 50000,
      status: "ACTIVE",
      createdAt: new Date(),
    });
  });

  const driverDb = testEnv.authenticatedContext(DRIVER_UID, { email: "driver@test.com", email_verified: true }).firestore();
  await assertSucceeds(driverDb.collection("trips").where("driverId", "==", DRIVER_UID).get());
  await assertFails(driverDb.collection("trips").doc("trip2").get());
});

test("Driver: cannot delete or directly edit expense entries", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("expense_entries").doc("exp1").set({
      id: "exp1",
      vehicleId: "v1",
      driverId: DRIVER_UID,
      category: "YEMEK",
      amount: 250,
      createdAt: new Date(),
    });
  });

  const driverDb = testEnv.authenticatedContext(DRIVER_UID, { email: "driver@test.com", email_verified: true }).firestore();
  // Driver cannot delete
  await assertFails(driverDb.collection("expense_entries").doc("exp1").delete());
  // Driver cannot update
  await assertFails(driverDb.collection("expense_entries").doc("exp1").update({ amount: 300 }));
});

test("Driver: can create correction request", async () => {
  const driverDb = testEnv.authenticatedContext(DRIVER_UID, { email: "driver@test.com", email_verified: true }).firestore();
  await assertSucceeds(driverDb.collection("correction_requests").doc("req1").set({
    id: "req1",
    driverId: DRIVER_UID,
    targetType: "EXPENSE",
    targetId: "exp1",
    requestedChanges: "Tutar 250 TL yerine 300 TL olacaktı",
    status: "PENDING",
    createdAt: new Date(),
  }));
});

test("Admin: bootstrap user sh_dilek@hotmail.com can read debts", async () => {
  const adminDb = testEnv.authenticatedContext(ADMIN_UID, { email: "sh_dilek@hotmail.com", email_verified: true }).firestore();
  await assertSucceeds(adminDb.collection("debt_records").get());
});
