import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateFormWebsiteDto } from '../../src/form-configuration/dto/create-form-website.dto';
import { UpdateFormWebsiteDto } from '../../src/form-configuration/dto/update-form-website.dto';

const createErrors = (siteUrl: unknown) =>
  validateSync(plainToInstance(CreateFormWebsiteDto, { code: 'X', name: 'X', siteUrl })).map((e) => e.property);
const updateErrors = (siteUrl: unknown) => validateSync(plainToInstance(UpdateFormWebsiteDto, { siteUrl })).map((e) => e.property);

describe('FormWebsite siteUrl', () => {
  it.each(['https://www.spyrofans.com', 'https://spyrofans.com', 'https://shop.example.co.in/site', 'http://localhost:5174', 'http://127.0.0.1:5174'])(
    'accepts %s',
    (url) => {
      expect(createErrors(url)).toEqual([]);
      expect(updateErrors(url)).toEqual([]);
    },
  );

  it.each([
    'http://www.spyrofans.com',
    'https://www.spyrofans.com/',
    'https://www.spyrofans.com/blog/',
    'https://www.spyrofans.com?x=1',
    'www.spyrofans.com',
    'javascript:alert(1)',
    'https://',
    'ftp://spyrofans.com',
  ])('rejects %s', (url) => {
    expect(createErrors(url)).toEqual(['siteUrl']);
    expect(updateErrors(url)).toEqual(['siteUrl']);
  });

  it('is optional, and an empty string clears it on update', () => {
    expect(createErrors(undefined)).toEqual([]);
    expect(updateErrors('')).toEqual([]);
  });
});
