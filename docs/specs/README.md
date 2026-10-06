# Specification index

[Hosting Architecture & Upgrade Path](../../shootball-arena-architecture.md) is the source of truth for technical direction. The current slice is **authoritative points-based PvP with bots and pickups**, extending the local prototype. Colyseus runs locally; cloud deployment, identity/persistence and distributed infrastructure remain deferred. No Unity code is ported.

- [Gameplay](gameplay.md)
- [Frontend](frontend.md)
- [Game server](game-server.md)
- [Networking](networking.md)
- [Auth and database](auth-database.md)
- [Deployment](deployment.md)
- [Art direction](art-direction.md)

These specs describe core direction. Use [docs/integrationspec](../integrationspec/README.md) for concrete multi-system work plans, dependencies, acceptance checks, implementation status and verification evidence. Update the integration spec before implementing a major change and keep core specs aligned with actual behavior.
