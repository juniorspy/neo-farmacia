import axios from 'axios';
import { logger } from './logger.js';
import type { AppConfig } from '../config/env.js';

/**
 * Scoped Odoo client — targets an arbitrary database by name.
 *
 * The legacy shared/odoo.ts keeps a single authenticated session against
 * config.odoo.db for backward compatibility with existing modules. This
 * client is used for provisioning new pharmacy databases and for any code
 * that must operate on a tenant-specific DB.
 */

async function jsonRpc(url: string, params: Record<string, unknown>, timeoutMs = 120000) {
  const res = await axios.post(
    url,
    { jsonrpc: '2.0', id: Date.now(), method: 'call', params },
    { timeout: timeoutMs },
  );
  if (res.data.error) {
    const err = res.data.error;
    const msg = err?.data?.message || err?.message || JSON.stringify(err);
    throw new Error(`Odoo RPC error: ${msg}`);
  }
  return res.data.result;
}

export interface ScopedOdooOptions {
  url: string;
  db: string;
  user: string;
  password: string;
}

export class ScopedOdoo {
  private uid: number | null = null;

  constructor(private opts: ScopedOdooOptions) {}

  async authenticate(): Promise<number> {
    if (this.uid) return this.uid;
    const result = await jsonRpc(`${this.opts.url}/jsonrpc`, {
      service: 'common',
      method: 'authenticate',
      args: [this.opts.db, this.opts.user, this.opts.password, {}],
    });
    if (!result) {
      throw new Error(`Odoo authentication failed for db=${this.opts.db} user=${this.opts.user}`);
    }
    this.uid = result as number;
    return this.uid;
  }

  async execute(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<unknown> {
    const uid = await this.authenticate();
    return jsonRpc(`${this.opts.url}/jsonrpc`, {
      service: 'object',
      method: 'execute_kw',
      args: [this.opts.db, uid, this.opts.password, model, method, args, kwargs],
    });
  }
}

// ── Database-service level operations (require master password) ──

export async function odooDbList(url: string): Promise<string[]> {
  const result = await jsonRpc(`${url}/jsonrpc`, {
    service: 'db',
    method: 'list',
    args: [],
  });
  return (result as string[]) || [];
}

export async function odooDbExists(url: string, dbName: string): Promise<boolean> {
  const list = await odooDbList(url);
  return list.includes(dbName);
}

export async function odooDbCreate(
  config: AppConfig,
  dbName: string,
  opts: { adminPassword: string; adminLogin: string; lang?: string; countryCode?: string },
): Promise<void> {
  const { url, masterPassword } = config.odoo;
  logger.info({ dbName }, 'Odoo db.create_database start');
  // Signature: create_database(master_pwd, db_name, demo, lang, user_password, login, country_code, phone)
  // https://github.com/odoo/odoo/blob/17.0/odoo/service/db.py
  await jsonRpc(
    `${url}/jsonrpc`,
    {
      service: 'db',
      method: 'create_database',
      args: [
        masterPassword,
        dbName,
        false, // demo data
        opts.lang || config.odoo.defaultLang,
        opts.adminPassword,
        opts.adminLogin,
        opts.countryCode || config.odoo.defaultCountryCode,
        '', // phone
      ],
    },
    600000, // 10 min — db creation is slow
  );
  logger.info({ dbName }, 'Odoo db.create_database done');
}

export async function odooDbDrop(url: string, masterPassword: string, dbName: string): Promise<void> {
  // Idempotent: don't fail if the DB is already gone
  const exists = await odooDbExists(url, dbName);
  if (!exists) {
    logger.info({ dbName }, 'Odoo database already gone, skipping drop');
    return;
  }
  await jsonRpc(`${url}/jsonrpc`, {
    service: 'db',
    method: 'drop',
    args: [masterPassword, dbName],
  });
  logger.info({ dbName }, 'Odoo database dropped');
}

export function makeScopedOdoo(config: AppConfig, dbName: string, login?: string, password?: string): ScopedOdoo {
  return new ScopedOdoo({
    url: config.odoo.url,
    db: dbName,
    user: login || config.odoo.defaultAdminEmail,
    password: password || config.odoo.defaultAdminPassword,
  });
}
