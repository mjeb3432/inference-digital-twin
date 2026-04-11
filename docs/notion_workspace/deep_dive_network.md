# Deep Dive - Fiber, Carrier, and Interconnect Strategy

Back to workspace landing: https://www.notion.so/Forge-Data-Center-Open-Source-Public-Workspace-3324a1784e5980bc87b8fc9c32645c96

## Why This Stage Matters

Network architecture determines how much of your theoretical compute performance is actually reachable for real users.

## External Network Decisions

- access mode (lit, dark, build-to-prem)
- carrier diversity
- IXP region strategy

## Internal Network Decisions

- intra-node fabric
- inter-node fabric
- topology profile and scale strategy

## Common Mistakes

- relying on single-carrier plans for production
- scaling node count without reassessing switch and topology effects
- interpreting peak throughput without penalty context

## Best-Practice Checklist

1. require at least two carriers for resiliency
2. model latency and quality, not only bandwidth
3. evaluate topology penalties as node count increases
4. separate per-link and aggregate throughput in reporting

## What to Compare Across Scenarios

- latency class and expected RTT impact
- network penalty trend vs node count
- networking capex and external bandwidth opex
