import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { QueryContentPostDto } from '../../src/content/dto/query-content-post.dto';

function parse(query: Record<string, string>) {
  const dto = plainToInstance(QueryContentPostDto, query);
  return { dto, errors: validateSync(dto, { whitelist: true }).map((e) => e.property) };
}

describe('QueryContentPostDto', () => {
  it('defaults to last-updated sort, page 1, 20 per page', () => {
    const { dto, errors } = parse({});
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ sort: 'updated_desc', page: 1, limit: 20 });
  });

  it.each(['updated_desc', 'published_desc', 'published_asc', 'title_asc', 'title_desc'])('accepts sort=%s', (sort) => {
    expect(parse({ sort }).errors).toEqual([]);
  });

  it.each(['createdAt', 'title', 'title_asc; DROP TABLE', 'publishedData.title'])('rejects sort=%s', (sort) => {
    expect(parse({ sort }).errors).toEqual(['sort']);
  });

  it('parses query-string booleans and numbers', () => {
    const { dto, errors } = parse({ hasUnpublishedChanges: 'true', featured: 'false', page: '3', limit: '50' });
    expect(errors).toEqual([]);
    expect(dto).toMatchObject({ hasUnpublishedChanges: true, featured: false, page: 3, limit: 50 });
  });

  it('rejects a non-uuid website, unknown status/category, and limits over 100', () => {
    const { errors } = parse({ formWebsiteId: 'SPYRO', status: 'LIVE', category: 'Gossip', limit: '500' });
    expect(errors.sort()).toEqual(['category', 'formWebsiteId', 'limit', 'status']);
  });
});
