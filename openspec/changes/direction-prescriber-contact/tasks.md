## 1. Consume the stamp

- [x] 1.1 `Authorisation` gains `prescriberPhone?` / `prescriberPrincipalPlace?`
- [x] 1.2 `mapAuthorisation` maps both, absent stamps staying absent
- [x] 1.3 `prescriberContactForCapture` resolves stamp → profile, per field
- [x] 1.4 `DirectionDialog` prefills from the resolver

## 2. Verify

- [x] 2.1 Unit tests: mapper, resolver, dialog prefill for a nurse
- [x] 2.2 `npm test` and `npm run lint` clean
