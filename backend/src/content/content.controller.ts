import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePermission } from '../permissions/require-permission.decorator';
import { CONTENT_MEDIA_MAX_BYTES } from './content.constants';
import { ContentActor, ContentService } from './content.service';
import { CreateContentPostDto } from './dto/create-content-post.dto';
import { UpdateContentPostDto } from './dto/update-content-post.dto';
import { QueryContentPostDto } from './dto/query-content-post.dto';
import { ContentPostVersionDto } from './dto/content-post-version.dto';

// Content admin API
@ApiTags('content')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/content')
export class ContentController {
  constructor(private contentService: ContentService) {}

  @Get('websites')
  @RequirePermission('Content', 'View')
  listWebsites() {
    return this.contentService.listWebsites();
  }

  @Get('websites/:websiteId/products')
  @RequirePermission('Content', 'View')
  listProductOptions(@Param('websiteId') websiteId: string) {
    return this.contentService.listProductOptions(websiteId);
  }

  // Image upload
  @Post('websites/:websiteId/images')
  @RequirePermission('Content', 'Edit')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: CONTENT_MEDIA_MAX_BYTES, files: 1 } }))
  uploadImage(@Param('websiteId') websiteId: string, @UploadedFile() file: Express.Multer.File, @Req() req: any) {
    return this.contentService.uploadImage(websiteId, file, actorOf(req));
  }

  @Get('posts')
  @RequirePermission('Content', 'View')
  findAll(@Query() query: QueryContentPostDto) {
    return this.contentService.findAll(query);
  }

  // Before posts/:id
  @Get('posts/counts')
  @RequirePermission('Content', 'View')
  countByStatus(@Query() query: QueryContentPostDto) {
    return this.contentService.countByStatus(query);
  }

  @Get('posts/:id')
  @RequirePermission('Content', 'View')
  findOne(@Param('id') id: string) {
    return this.contentService.findOne(id);
  }

  @Post('posts')
  @RequirePermission('Content', 'Create')
  create(@Body() dto: CreateContentPostDto, @Req() req: any) {
    return this.contentService.create(dto, actorOf(req));
  }

  @Patch('posts/:id')
  @RequirePermission('Content', 'Edit')
  update(@Param('id') id: string, @Body() dto: UpdateContentPostDto, @Req() req: any) {
    return this.contentService.update(id, dto, actorOf(req));
  }

  @Post('posts/:id/publish')
  @RequirePermission('Content', 'Publish')
  publish(@Param('id') id: string, @Body() dto: ContentPostVersionDto, @Req() req: any) {
    return this.contentService.publish(id, dto.version, actorOf(req));
  }

  @Post('posts/:id/unpublish')
  @RequirePermission('Content', 'Publish')
  unpublish(@Param('id') id: string, @Body() dto: ContentPostVersionDto, @Req() req: any) {
    return this.contentService.unpublish(id, dto.version, actorOf(req));
  }

  @Post('posts/:id/archive')
  @RequirePermission('Content', 'Delete')
  archive(@Param('id') id: string, @Body() dto: ContentPostVersionDto, @Req() req: any) {
    return this.contentService.archive(id, dto.version, actorOf(req));
  }

  @Post('posts/:id/restore')
  @RequirePermission('Content', 'Delete')
  restore(@Param('id') id: string, @Body() dto: ContentPostVersionDto, @Req() req: any) {
    return this.contentService.restore(id, dto.version, actorOf(req));
  }

  // Archived posts only
  @Delete('posts/:id')
  @RequirePermission('Content', 'Delete')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.contentService.remove(id, actorOf(req));
  }
}

function actorOf(req: any): ContentActor {
  return { id: req.user?.id, name: req.user?.name };
}
