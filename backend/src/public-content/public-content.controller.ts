import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PublicContentService } from './public-content.service';
import { QueryPublicContentDto } from './dto/query-public-content.dto';

// Public content API
@ApiTags('public-content')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { ttl: 60_000, limit: 120 } })
@Controller('api/v1/public/content')
export class PublicContentController {
  constructor(private publicContentService: PublicContentService) {}

  @Get(':publicFormKey/posts')
  @Header('Cache-Control', 'public, max-age=60')
  listPosts(@Param('publicFormKey') publicFormKey: string, @Query() query: QueryPublicContentDto) {
    return this.publicContentService.listPosts(publicFormKey, query);
  }

  @Get(':publicFormKey/posts/:slug')
  @Header('Cache-Control', 'public, max-age=60')
  getPost(@Param('publicFormKey') publicFormKey: string, @Param('slug') slug: string) {
    return this.publicContentService.getPost(publicFormKey, slug);
  }
}
