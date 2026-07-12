// Port of RolePermissionSeeder + OwnerSeeder + CategorySeeder + ExpenseCategorySeeder
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const PERMISSIONS = [
  ["process_sales", "Process Sales"], ["view_own_sales", "View Own Sales"],
  ["view_all_sales", "View All Sales"], ["process_returns", "Process Returns"],
  ["give_discounts", "Give Discounts"], ["manage_products", "Manage Products"],
  ["view_inventory", "View Inventory"], ["receive_stock", "Receive Stock"],
  ["adjust_stock", "Adjust Stock"], ["perform_stock_take", "Perform Stock Take"],
  ["create_purchase_order", "Create Purchase Orders"], ["approve_purchase_order", "Approve Purchase Orders"],
  ["manage_suppliers", "Manage Suppliers"], ["record_supplier_payment", "Record Supplier Payments"],
  ["record_expense", "Record Expenses"], ["approve_expense", "Approve Expenses"],
  ["view_expenses", "View Expenses"], ["open_shift", "Open Shift"], ["close_shift", "Close Shift"],
  ["view_financial_reports", "View Financial Reports"], ["view_sales_reports", "View Sales Reports"],
  ["view_inventory_reports", "View Inventory Reports"], ["manage_users", "Manage Users"],
  ["manage_roles", "Manage Roles"], ["change_settings", "Change Settings"],
];

const ROLE_PERMS = {
  owner: "*",
  super_admin: "*",
  manager: [
    "process_sales", "view_all_sales", "process_returns", "give_discounts",
    "manage_products", "view_inventory", "receive_stock", "adjust_stock", "perform_stock_take",
    "create_purchase_order", "approve_purchase_order", "manage_suppliers", "record_supplier_payment",
    "record_expense", "approve_expense", "view_expenses", "open_shift", "close_shift",
    "view_financial_reports", "view_sales_reports", "view_inventory_reports",
  ],
  cashier: ["process_sales", "view_own_sales", "view_inventory", "open_shift", "close_shift", "record_expense"],
};

async function main() {
  // Permissions
  const permMap = {};
  for (const [name, displayName] of PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name, displayName },
    });
    permMap[name] = p.id;
  }

  // Roles
  const roleMeta = {
    owner: ["System Owner", "Ultimate system authority and control"],
    super_admin: ["Super Admin", "Full system access"],
    manager: ["Manager", "Store management access"],
    cashier: ["Cashier", "Point of sale access"],
  };
  const roleMap = {};
  for (const [name, [displayName, description]] of Object.entries(roleMeta)) {
    const perms = ROLE_PERMS[name] === "*" ? Object.values(permMap) : ROLE_PERMS[name].map((n) => permMap[n]);
    const r = await prisma.role.upsert({
      where: { name },
      update: { permissionIds: perms },
      create: { name, displayName, description, permissionIds: perms },
    });
    roleMap[name] = r.id;
  }

  // Main branch
  let branch = await prisma.branch.findFirst({ where: { isMain: true } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: { name: "Main Branch", code: "MAIN", isMain: true, isActive: true, stockDistributionPercentage: 100 },
    });
  }

  // Owner user
  const email = "owner@nebtech.store";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    await prisma.user.create({
      data: {
        name: "System Owner",
        email,
        password: await bcrypt.hash("password", 10),
        isActive: true,
        branchId: branch.id,
        roleIds: [roleMap.owner],
      },
    });
    console.log(`Owner created: ${email} / password`);
  }

  // Categories
  for (const name of ["General", "Electronics", "Accessories", "Trade-in"]) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }
  for (const name of ["Rent", "Utilities", "Salaries", "Transport", "Supplies", "Miscellaneous"]) {
    await prisma.expenseCategory.upsert({ where: { name }, update: {}, create: { name } });
  }

  // Default settings (system control + subscription)
  const settings = [
    ["system_active", "1", "Master system on/off switch"],
    ["subscription_active", "1", "Subscription status"],
    ["subscription_expires_at", "", "Subscription expiry date (ISO)"],
    ["business_name", "NebTech Store", "Business name shown on receipts"],
    ["tax_rate", "0", "VAT/tax percentage applied at POS"],
  ];
  for (const [key, value, description] of settings) {
    await prisma.setting.upsert({ where: { key }, update: {}, create: { key, value, description } });
  }

  console.log("Seed complete.");
}

main().finally(() => prisma.$disconnect());
