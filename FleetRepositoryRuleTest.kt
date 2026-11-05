package com.example.data.repository

import com.example.base.FirestoreEmulatorTestBase
import com.example.data.model.ExpenseEntry
import com.example.data.model.Vehicle
import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class FleetRepositoryRuleTest : FirestoreEmulatorTestBase() {

    @Test
    fun bootstrapInitialData_createsVehicles() = runBlocking {
        val adminUid = signInTestUser(ADMIN_EMAIL)
        val repository = FleetRepository(firestore)

        withTimeout(DEFAULT_TIMEOUT_MS) {
            repository.syncOrCreateUserProfile(adminUid, ADMIN_EMAIL, "Yönetici")
            repository.bootstrapInitialData()
        }

        val vehicles = withTimeout(FLOW_TIMEOUT_MS) {
            repository.observeVehicles().first { list: List<Vehicle> -> list.isNotEmpty() }
        }
        assertTrue("En az 3 araç oluşturulmalı", vehicles.size >= 3)
        assertTrue("Ford Cargo 1838 bulunmalı", vehicles.any { it.plate == "34 KAR 1838" })
    }

    @Test
    fun addExpenseEntry_driver_savesSuccessfully() = runBlocking {
        val driverUid = signInTestUser(DRIVER_EMAIL)
        val repository = FleetRepository(firestore)

        withTimeout(DEFAULT_TIMEOUT_MS) {
            repository.syncOrCreateUserProfile(driverUid, DRIVER_EMAIL, "Şoför 1")
            repository.addExpenseEntry(
                vehicleId = "ford_cargo_1838",
                tripId = "SFR-TEST-01",
                category = "YEMEK",
                amount = 350.0,
                description = "Yol yemeği",
                locationAddress = "Bolu Dağı"
            )
        }

        val expenses = withTimeout(FLOW_TIMEOUT_MS) {
            repository.observeDriverExpenseEntries(driverUid).first { list: List<ExpenseEntry> -> list.isNotEmpty() }
        }
        assertTrue("Eklenen masraf bulunmalı", expenses.any { it.category == "YEMEK" && it.amount == 350.0 })
    }

    @Test
    fun observeTrips_unauthenticatedUser_failsWithPermissionDenied() = runBlocking {
        auth.signOut()
        val repository = FleetRepository(firestore)

        try {
            withTimeout(FLOW_TIMEOUT_MS) {
                repository.observeTrips().first()
            }
            fail("Yetkisiz erişim PERMISSION_DENIED vermeliydi")
        } catch (e: Exception) {
            val firestoreException = checkNotNull(e.unwrapFirestoreException()) {
                "Expected nested FirebaseFirestoreException, got $e"
            }
            assertEquals(FirebaseFirestoreException.Code.PERMISSION_DENIED, firestoreException.code)
        }
    }

    private companion object {
        const val ADMIN_EMAIL = "sh_dilek@hotmail.com"
        const val DRIVER_EMAIL = "driver1@test.com"
        const val DEFAULT_TIMEOUT_MS = 10000L
        const val FLOW_TIMEOUT_MS = 8000L
    }
}
