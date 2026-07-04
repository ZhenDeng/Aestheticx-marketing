# Consult calls (web slice) — plan

Design: `docs/superpowers/specs/2026-07-04-consult-calls-web-design.md`
Branch: `feat/consult-calls-web`

## Tasks

- [x] 1. Pure layer (test-first, `calls.test.ts`): `incomingCallFromSignal` +
      `callDisplayName` in `src/lib/demo/calls.ts`; `lastCalledDoctorByUser` on `DemoState`
      + `recordCalledDoctor`/`mostRecentlyCalledDoctor` in `backend.ts` (14 new tests)
- [x] 2. Live plumbing: `mirrorRecordCalledDoctor` / `mirrorStartConsultCall` /
      `mirrorMintCallToken` in `mirror.ts`; `readUserProfile` reads `lastCalledDoctorId`;
      store `startConsult` + `mostRecentlyCalledDoctor`
- [x] 3. `ConsultCallProvider` + `CallOverlay` (live LiveKit via dynamic import; demo
      simulated) + incoming-call banner (live-only consultSignals listener); mounted in the
      /app layout; `livekit-client@2.20.0` dependency
- [x] 4. Launch surfaces: Start consult on /app/authorisations rows (doctor + nurse) and on
      the patient-file open requests
- [x] 5. Verify: vitest (363) + tsc + `next build` green; browser-checked in demo mode from
      all three surfaces (nurse authorisations row, patient-file open request, doctor
      pending card): overlay rings → simulated in-call with timer → End call closes; no
      console errors. Live LiveKit/signal path is code-reviewed but needs manual live-mode
      verification (two signed-in parties) — noted in the PR.
- [ ] 6. Engineer review; fix findings
- [ ] 7. Docs/memory sync + PR
