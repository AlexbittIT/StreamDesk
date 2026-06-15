import { PERMISSIONS } from "@shared/schema";

type EquipmentUser = {
  role?: string | null;
  permissions?: unknown;
  workspaceMode?: string | null;
} | null | undefined;

function getPermissions(user: EquipmentUser): string[] {
  if (!Array.isArray(user?.permissions)) return [];
  return user.permissions.filter((permission): permission is string => typeof permission === "string");
}

function isEquipmentSuperUser(user: EquipmentUser): boolean {
  return user?.role === "admin" || user?.role === "tech_director" || user?.workspaceMode === "company_owner";
}

export function canCreateEquipment(user: EquipmentUser): boolean {
  return isEquipmentSuperUser(user) || getPermissions(user).includes(PERMISSIONS.EQUIPMENT_CREATE);
}

export function canEditEquipment(user: EquipmentUser): boolean {
  return isEquipmentSuperUser(user) || getPermissions(user).includes(PERMISSIONS.EQUIPMENT_EDIT);
}

export function canReserveEquipment(user: EquipmentUser): boolean {
  return canEditEquipment(user) || isEquipmentSuperUser(user) || getPermissions(user).includes(PERMISSIONS.EQUIPMENT_RESERVE);
}
