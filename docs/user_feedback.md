# User Feedback Summary

## Feedback method

During this sprint, we conducted two structured stakeholder review sessions. The goal was to validate whether the current implementation is moving in the right direction for the real StreamDesk workflow, especially around estimates, connection diagrams, export, AI-assisted actions, and project-level navigation.

The sessions were conducted in a usability-review format. Stakeholders were shown the current product state, asked to go through the main flows, and then gave feedback on clarity, usefulness, missing states, and remaining risks.

## Participants

| Participant | Role / perspective              | Why this feedback is relevant                                                                                                                               |
| ----------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sasha       | Product / technical stakeholder | Reviewed whether the implemented flows match the expected operational logic of StreamDesk and whether the product can support real event-preparation work.  |
| Amal        | Product / workflow stakeholder  | Reviewed usability, clarity of user actions, and whether the interface is understandable for people who need to work with estimates and technical planning. |

Total number of feedback participants: **2 stakeholders**.

## Tested flows

The stakeholders reviewed the following flows:

* opening and working with the estimates module;
* exporting an estimate to Excel and PDF;
* checking how estimate positions are grouped and displayed;
* reviewing estimate status logic;
* checking project binding and estimate versioning direction;
* reviewing removal of outdated delivery/transport logic;
* checking AI-related states and error handling;
* reviewing warehouse matching, deficit handling, and “no price” cases;
* checking shift calculation rules and server-side recalculation logic;
* reviewing role-based visibility / data isolation direction;
* reviewing current bug fixes around canvas, icons, export, search, and AI mode.

## Key findings

### 1. Estimates became closer to a real workflow

Stakeholders noted that the estimates module now looks less like a temporary prototype and more like a real product feature. The most important improvement is that estimates are no longer treated only as isolated local objects. The direction with project binding, versioning, export, warehouse matching, and server-side calculations makes the feature more usable for actual event preparation.

### 2. Export is important for real users

Both stakeholders confirmed that Excel/PDF export is not just an additional feature, but a necessary part of the workflow. Event teams often need to send estimates outside the platform, attach them to agreements, or share them with managers and clients. Because of this, export quality and predictable formatting should remain a priority.

### 3. Error states should be visible, not hidden behind fallbacks

One repeated point was that AI and calculation failures must not be hidden. Stakeholders preferred explicit error states over silent fallback behaviour. This is especially important for estimates, because wrong totals or unclear AI output can directly affect planning and budgeting.

### 4. Warehouse matching adds real product value

The warehouse matching direction was evaluated positively. Stakeholders highlighted that an estimate becomes much more useful when it can show whether equipment is available, missing, or present without a known price. The “deficit” and “no price” cases should be kept visible because they help the user understand what still needs manual attention.

### 5. Shift calculation must be server-side and predictable

Stakeholders confirmed that shift calculation rules should not depend on frontend-only logic. Day/night/weekend rates, additional dates, rounding, and final totals need predictable server-side handling, because different users should receive the same calculation result.

### 6. Role visibility and isolation are important for industrial use

The review also confirmed that role-based visibility is not a minor detail. In a real company workflow, not every user should see or edit the same data. The added direction for data visibility by role was considered necessary for making the product safer for business use.

## Problems found during review

The following issues were identified or confirmed during review:

* some flows still need stronger end-to-end testing;
* AI-related states need clear frontend messages when generation fails;
* estimate calculations need to be checked against edge cases such as night/weekend rates and rounding;
* warehouse matching should clearly distinguish available items, deficits, and items without a price;
* export should be tested on realistic estimate data, not only on small examples;
* project binding and versioning should be tested as a full user journey;
* current UI bugs from the board should be retested after fixes.

## Before / after observations

| Area                             | Before                                                                                         | After current sprint                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Estimates storage and navigation | Estimates were closer to isolated/local work and were not fully connected to the project flow. | Estimates are moving toward project binding, versioning, and navigation from project context.        |
| Export                           | Sharing estimates outside the platform was limited.                                            | Excel/PDF export and transfer into the estimate flow were added.                                     |
| AI behaviour                     | AI failures could be unclear or hidden behind fallback behaviour.                              | Error states and source indication became part of the expected flow.                                 |
| Warehouse matching               | Estimate items were not clearly checked against warehouse availability.                        | Matching, deficit handling, and “no price” cases were added to the backlog/implementation flow.      |
| Shift calculation                | Shift totals could be calculated inconsistently or on the client side.                         | Server-side recalculation and clearer shift rules were added as a required implementation direction. |
| Data visibility                  | Role-level access rules were not explicit enough.                                              | Role-based data visibility / isolation was added as a product requirement and implementation task.   |
| Bug fixing                       | Several issues from the previous diagram/canvas work remained open.                            | Current bugs were collected, fixed or moved into the review backlog for retesting.                   |

## Conclusions

The stakeholder feedback was positive overall. Sasha and Amal both confirmed that the current direction makes StreamDesk more useful as an industrial product, especially because the team is moving from separate prototype features toward connected workflows: project-linked estimates, export, AI support, warehouse matching, visible error states, and role-based visibility.

The main conclusion is that the product is moving in the right direction, but the next step should focus on stability and verification. The team needs to retest fixed bugs, check estimate calculations on realistic cases, validate export output, and make sure AI and warehouse-related edge cases are shown clearly to the user instead of being hidden.

## Follow-up actions from feedback

* Retest all current bug fixes after implementation.
* Check export on realistic estimate data.
* Validate shift calculation rules for day/night/weekend rates and rounding.
* Make AI failure states visible and understandable.
* Keep warehouse deficit and “no price” states visible in the estimate UI.
* Test project binding and estimate versioning as one complete user journey.
* Continue role-based visibility and data isolation checks.
