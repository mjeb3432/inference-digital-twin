# Contracts v1

This folder contains the locked v1 data contracts for the Inference Digital Twin core:

- `scenario-spec.v1.schema.json` - canonical input scenario definition.
- `module-io.v1.schema.json` - worker module input/output envelope.
- `prediction-report.v1.schema.json` - persisted report payload returned to API/UI.
- `error-taxonomy.v1.json` - canonical error classes from eng review.

All contracts are strict (`additionalProperties: false`) and versioned in-band with a `contract` field.
