## Release to Production (test-deploy → main)

**What is in this release:**
- 

**Tested on TEST:** the TEST site (URL in repo variable `TEST_FRONTEND_URL`)

### QA checklist — every box must be ticked or production will not deploy
- [ ] Deploy to TEST pipeline is green for the latest commit of this PR
- [ ] Every fix/feature in this release was tested on TEST by someone other than its developer
- [ ] Regression checks passed (qa/16_Regression.csv)
- [ ] No open Critical or High bugs (GitHub Issues)
- [ ] Emails checked in the Ethereal inbox (tick if no email changes)
- [ ] Login, Quotation, Sales Order and Invoice flows checked on TEST

**QA tested by:** 
**Approver:** @santosh2808
