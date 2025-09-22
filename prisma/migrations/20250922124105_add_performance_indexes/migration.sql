-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('credit_card', 'debit_card', 'cash', 'bank_transfer', 'digital_wallet');

-- CreateEnum
CREATE TYPE "budget_period" AS ENUM ('monthly', 'quarterly', 'yearly');

-- CreateEnum
CREATE TYPE "report_type" AS ENUM ('monthly', 'quarterly', 'yearly', 'custom');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_resets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3B82F6',
    "icon" TEXT NOT NULL DEFAULT 'folder',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "description" TEXT NOT NULL,
    "transaction_date" DATE NOT NULL,
    "merchant" TEXT,
    "payment_method" "payment_method" NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "ai_confidence" DECIMAL(3,2),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "receipt_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "period" "budget_period" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "report_type" NOT NULL,
    "parameters" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "file_path" TEXT,
    "is_scheduled" BOOLEAN NOT NULL DEFAULT false,
    "schedule_config" JSONB,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_category_rules" (
    "id" TEXT NOT NULL,
    "keywords" TEXT[],
    "patterns" TEXT[],
    "category_id" TEXT NOT NULL,
    "confidence" DECIMAL(3,2) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_category_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "password_resets_token_key" ON "password_resets"("token");

-- CreateIndex
CREATE INDEX "password_resets_user_id_idx" ON "password_resets"("user_id");

-- CreateIndex
CREATE INDEX "password_resets_expires_at_idx" ON "password_resets"("expires_at");

-- CreateIndex
CREATE INDEX "password_resets_created_at_idx" ON "password_resets"("created_at");

-- CreateIndex
CREATE INDEX "password_resets_token_idx" ON "password_resets"("token");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "expenses_user_id_transaction_date_idx" ON "expenses"("user_id", "transaction_date" DESC);

-- CreateIndex
CREATE INDEX "expenses_user_id_category_id_transaction_date_idx" ON "expenses"("user_id", "category_id", "transaction_date");

-- CreateIndex
CREATE INDEX "expenses_category_id_idx" ON "expenses"("category_id");

-- CreateIndex
CREATE INDEX "idx_user_date_amount" ON "expenses"("user_id", "transaction_date", "amount");

-- CreateIndex
CREATE INDEX "idx_date_user" ON "expenses"("transaction_date", "user_id");

-- CreateIndex
CREATE INDEX "idx_user_amount" ON "expenses"("user_id", "amount");

-- CreateIndex
CREATE INDEX "idx_category_date_amount" ON "expenses"("category_id", "transaction_date", "amount");

-- CreateIndex
CREATE INDEX "idx_user_created" ON "expenses"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_transaction_date" ON "expenses"("transaction_date");

-- CreateIndex
CREATE INDEX "budgets_user_id_category_id_idx" ON "budgets"("user_id", "category_id");

-- CreateIndex
CREATE INDEX "idx_user_active_period" ON "budgets"("user_id", "is_active", "period");

-- CreateIndex
CREATE INDEX "idx_user_date_range" ON "budgets"("user_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "idx_active_date_range" ON "budgets"("is_active", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "idx_user_active_dates" ON "budgets"("user_id", "is_active", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "idx_period_active" ON "budgets"("period", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_user_id_category_id_period_start_date_key" ON "budgets"("user_id", "category_id", "period", "start_date");

-- CreateIndex
CREATE INDEX "reports_user_id_generated_at_idx" ON "reports"("user_id", "generated_at" DESC);

-- CreateIndex
CREATE INDEX "ai_category_rules_category_id_idx" ON "ai_category_rules"("category_id");

-- AddForeignKey
ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_category_rules" ADD CONSTRAINT "ai_category_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
