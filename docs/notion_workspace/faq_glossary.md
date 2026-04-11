# FAQ and Glossary

Back to workspace landing: https://www.notion.so/Forge-Data-Center-Open-Source-Public-Workspace-3324a1784e5980bc87b8fc9c32645c96

## FAQ

### Is this a production traffic predictor?
No. V1 is a planning and tradeoff simulator, not a production telemetry replacement.

### Can I trust outputs for final procurement decisions?
Use outputs for decision narrowing and structured comparison. Final decisions should include engineering validation and vendor-specific evidence.

### Why are there hard phase gates?
To prevent invalid combinations from producing polished but misleading outputs.

### Why does provenance matter?
Because infrastructure decisions are long-lived. Teams need to know exactly which assumptions and model versions generated a result.

### Can external users contribute?
Yes. Use the roadmap/contribution guide and include explicit assumption or model change rationale.

## Glossary

- TTFT: Time to First Token
- TPS: Tokens per Second
- TPOT: Time per Output Token
- MFU: Model FLOP Utilization
- PUE: Power Usage Effectiveness
- CAPEX: capital expenditure
- OPEX: operating expenditure
- TCO: total cost of ownership
- DCIM: Data Center Infrastructure Management
- Scenario Hash: deterministic identity of canonicalized scenario input
- Provenance: metadata that explains how and where an output was produced
