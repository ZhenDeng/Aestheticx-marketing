## 1. Consume the stamp

- [ ] 1.1 `Authorisation` gains `prescriberPhone?` / `prescriberPrincipalPlace?`
- [ ] 1.2 `mapAuthorisation` maps both, absent stamps staying absent
- [ ] 1.3 `prescriberContactForCapture` resolves stamp → profile, per field
- [ ] 1.4 `DirectionDialog` prefills from the resolver

## 2. Verify

- [ ] 2.1 Unit tests: mapper, resolver, dialog prefill for a nurse
- [ ] 2.2 `npm test` and `npm run lint` clean
