import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module';
import { InboundLeadsController } from './inbound-leads.controller';
import { InboundLeadsService } from './inbound-leads.service';

@Module({
  imports: [LeadsModule],
  controllers: [InboundLeadsController],
  providers: [InboundLeadsService],
})
export class InboundLeadsModule {}
