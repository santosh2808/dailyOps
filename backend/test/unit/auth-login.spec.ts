import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../src/auth/auth.service';

const PASSWORD = 'Correct@123';

async function setup(user: Record<string, unknown> | null) {
  const hashed = await bcrypt.hash(PASSWORD, 4);
  const usersService: any = {
    findByUsernameOrEmail: jest.fn().mockResolvedValue(user ? { password: hashed, ...user } : null),
    findByIdWithAccess: jest.fn().mockResolvedValue({ departmentId: null, department: null, roleNames: [], permissionCodes: [] }),
  };
  const jwtService: any = { sign: jest.fn().mockReturnValue('signed-token') };
  return { auth: new AuthService(usersService, jwtService), jwtService };
}

const ACTIVE = { id: 'u1', name: 'Ravi', username: 'ravi', email: 'ravi@example.test', role: 'admin', isActive: true };

async function loginError(auth: AuthService, password: string) {
  try {
    await auth.login('ravi', password);
  } catch (error) {
    return error as UnauthorizedException;
  }
  throw new Error('expected login to fail');
}

describe('AuthService.login', () => {
  it('logs an active user in normally', async () => {
    const { auth } = await setup(ACTIVE);
    await expect(auth.login('ravi', PASSWORD)).resolves.toMatchObject({ accessToken: 'signed-token', user: { id: 'u1' } });
  });

  it('tells a disabled user, with the correct password, that the account is disabled — and issues no token', async () => {
    const { auth, jwtService } = await setup({ ...ACTIVE, isActive: false });
    const error = await loginError(auth, PASSWORD);
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error.getResponse()).toEqual({
      statusCode: 401,
      error: 'Unauthorized',
      code: 'ACCOUNT_DISABLED',
      message: 'Your account has been disabled. Please contact your administrator.',
    });
    expect(jwtService.sign).not.toHaveBeenCalled();
  });

  it('gives a disabled user with the wrong password the generic message (no account-state leak)', async () => {
    const { auth } = await setup({ ...ACTIVE, isActive: false });
    const error = await loginError(auth, 'wrong');
    expect(error.getResponse()).toMatchObject({ statusCode: 401, message: 'Invalid credentials' });
    expect(error.getResponse()).not.toHaveProperty('code');
  });

  it('keeps the generic message for an unknown username and for a wrong password', async () => {
    for (const [user, password] of [[null, PASSWORD], [ACTIVE, 'wrong']] as const) {
      const { auth } = await setup(user);
      const error = await loginError(auth, password);
      expect(error.getResponse()).toMatchObject({ statusCode: 401, message: 'Invalid credentials' });
    }
  });
});
