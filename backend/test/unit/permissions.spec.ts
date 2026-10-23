import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { PermissionsGuard } from '../../src/permissions/permissions.guard';
import { PERMISSION_KEY, RequireAllPermissions, RequirePermission } from '../../src/permissions/require-permission.decorator';

class Sample {
  @RequirePermission('SalesOrder', 'Edit')
  edit() {}
  @RequireAllPermissions([['SalesOrder', 'View'], ['Product', 'View']])
  both() {}
  open() {}
}

function ctx(handler: () => void, permissions?: string[]): ExecutionContext {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => ({ user: permissions ? { permissions } : undefined }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());
  const proto = Sample.prototype;

  it('stores lower-cased module.action codes', () => {
    expect(Reflect.getMetadata(PERMISSION_KEY, proto.edit)).toBe('salesorder.edit');
  });

  it('allows a user holding the permission', () => {
    expect(guard.canActivate(ctx(proto.edit, ['salesorder.edit']))).toBe(true);
  });

  it('rejects a user without the permission', () => {
    expect(() => guard.canActivate(ctx(proto.edit, ['salesorder.view']))).toThrow(ForbiddenException);
  });

  it('rejects when there is no authenticated user', () => {
    expect(() => guard.canActivate(ctx(proto.edit))).toThrow(ForbiddenException);
  });

  it('requires every permission when several are listed', () => {
    expect(() => guard.canActivate(ctx(proto.both, ['salesorder.view']))).toThrow(ForbiddenException);
    expect(guard.canActivate(ctx(proto.both, ['salesorder.view', 'product.view']))).toBe(true);
  });

  it('does not restrict handlers with no permission decorator', () => {
    expect(guard.canActivate(ctx(proto.open))).toBe(true);
  });
});

// Static guard against typos: every permission a controller demands must exist
// in the seeded permission catalog, otherwise nobody (not even an admin
// created from the seed) could ever call that endpoint.
describe('Controller permissions exist in the seed catalog', () => {
  const srcDir = path.join(__dirname, '../../src');
  const seed = fs.readFileSync(path.join(__dirname, '../../prisma/seed.ts'), 'utf8');
  const seeded = new Set(
    [...seed.matchAll(/\{\s*module:\s*'([A-Za-z]+)',\s*action:\s*'([A-Za-z]+)'/g)].map(
      (m) => `${m[1]}.${m[2]}`.toLowerCase(),
    ),
  );

  function controllerFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return controllerFiles(p);
      return e.name.endsWith('.controller.ts') ? [p] : [];
    });
  }

  it('finds the seeded catalog', () => {
    expect(seeded.size).toBeGreaterThan(50);
  });

  it('every @RequirePermission / @RequireAllPermissions code is seeded', () => {
    const missing: string[] = [];
    let checked = 0;
    for (const file of controllerFiles(srcDir)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/'([A-Za-z]+)',\s*'([A-Za-z]+)'/g)) {
        // only look at pairs inside a permission decorator call
        const before = text.slice(Math.max(0, m.index! - 80), m.index!);
        if (!/Require(All)?Permissions?\(\s*(\[\s*\[?)?\s*(\[\s*)?$/.test(before) && !/\]\s*,\s*\[\s*$/.test(before)) continue;
        const code = `${m[1]}.${m[2]}`.toLowerCase();
        checked++;
        if (!seeded.has(code)) missing.push(`${path.basename(file)}: ${code}`);
      }
    }
    // Guards against the scanner silently matching nothing.
    expect(checked).toBeGreaterThan(100);
    expect(missing).toEqual([]);
  });
});
