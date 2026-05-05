# Chronos Architecture Document

**Project Focus:** Chronos Utility/Utility Services.
**Architecture:** CloudFront/Route53 Facade $\to$ AWS Services.

**Domain Management:**
*   **Primary Domain (User Visible):** `chronos.com` (Managed via Dynadot DNS)
*   **Underlying Service:** AWS Lambda / API Gateway (Actual endpoint will be internal AWS endpoint).

**Components:**
*   [List of components and their current service architecture...]

**Last Updated:** [Date/Agent Name]
**Dependency:** Requires proper DNS configuration at the registrar level (Dynadot) to redirect all traffic to the primary domain.