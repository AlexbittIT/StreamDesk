# StreamDesk Platform Rebuild Notes

## Target product shape

StreamDesk is moving from a single internal workspace into a multi-tenant platform:

- one platform owner account sees all companies, users, load, failures, and complaints;
- any user can register and work personally or create a company workspace;
- company owners can invite people by link, approve membership, and control board visibility;
- projects are generic projects, not only video projects;
- task management is native first, with optional external sync;
- integrations with YouGile and WEEEK are optional per company.

## Platform roles

- `platform admin`: sees the whole platform, all companies, platform monitoring, and integration health;
- `company owner`: manages one company, invites users, approves access, connects integrations;
- `manager`: works inside the company with selected boards and projects;
- `employee`: only sees approved boards, projects, and tasks.

## Company model

Planned entities for the next phase:

- companies
- company members
- invitation links
- board access rules
- company integrations
- integration sync logs

## Registration flow

Target flow:

1. user creates an account;
2. user chooses personal mode or company mode;
3. if company mode, they create a company workspace;
4. owner invites employees by link or email;
5. invited employee registers or signs in with SSO;
6. company owner approves or rejects access;
7. owner decides which boards/projects each member can see.

## Task manager direction

- primary source of truth stays in StreamDesk database;
- YouGile and WEEEK stay optional connectors;
- two-way sync is enabled only when a company turns it on;
- tasks should move smoothly with optimistic updates and no side jumps;
- board-level visibility is company-specific, not global.

## Integration setup notes

### YouGile

Current app already has a server integration layer in [server/yougile.ts](c:/Users/6a6a/Desktop/StreamDesk/server/yougile.ts).

For the UI/manual guide we should expose:

- company ID
- API key
- default board / default column
- sync status
- last sync result

### WEEEK

Planned connector shape:

- API token per company
- optional workspace/project mapping
- optional board/task sync
- sync direction: import only or two-way

According to the official WEEEK help:

- API access is enabled from workspace settings;
- a token is created in the `API` section;
- WEEEK supports both personal and team workspaces;
- users can be invited by email or by link;
- access can be controlled by roles, and private boards/projects can be restricted separately.

## Immediate implementation order

1. stabilize auth and platform owner access;
2. add company and invitation tables;
3. separate platform admin from company owner permissions;
4. refactor projects/tasks to company scope;
5. add optional integration settings pages for YouGile and WEEEK;
6. polish drag-and-drop task UX.
