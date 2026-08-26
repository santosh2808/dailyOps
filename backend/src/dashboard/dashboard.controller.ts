import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardService } from './dashboard.service';
import { QueryRevenueDto } from './dto/query-revenue.dto';

@ApiTags('dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('stats')
  getStats() {
    return this.dashboardService.getStats();
  }

  // Additive: Dashboard Redesign endpoints below — all read-only reporting,
  // no existing endpoint's behavior changed.

  @Get('funnel')
  getFunnel() {
    return this.dashboardService.getFunnel();
  }

  @Get('revenue')
  getRevenue(@Query() query: QueryRevenueDto) {
    return this.dashboardService.getRevenue(query.period ?? 'monthly', query.month, query.year);
  }

  @Get('executives')
  getExecutivePerformance() {
    return this.dashboardService.getExecutivePerformance();
  }

  @Get('charts')
  getCharts() {
    return this.dashboardService.getCharts();
  }
}
