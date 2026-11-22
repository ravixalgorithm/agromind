# Permission e-mails — DES and CACP

Both sites allow reproduction “free of charge after taking proper permission by sending a mail
to us”, with the material reproduced accurately and the source prominently acknowledged
(DES: <https://desagri.gov.in/website-policies/> §1; CACP: <https://cacp.da.gov.in/Home/Privacy> §1).
Send both **before the paper is submitted**, then record the date sent and the reply in
`DATA_PROVENANCE.md` (rows S1 and S7, “Permission e-mail”) and close item 7 in `WEAKNESSES.md`.

Sender: Ravi Pratap Singh, on behalf of the team, from 230104047@hbtu.ac.in, with the
supervisor (Prof. (Dr.) Imran Khan) in Cc if possible. Addresses are the ones each site lists on its
contact page (checked 2026-11-23); re-check before sending.

---

## 1. To DES (crop area, production and yield)

**To:** Web Information Manager, Economics, Statistics & Evaluation Division, DA&FW —
`santosh.kumar01@gov.in` (listed at <https://desagri.gov.in/contact-us/>)

**Subject:** Request for permission to reproduce district-wise APY statistics in an academic project

> Dear Sir/Madam,
>
> I am Ravi Pratap Singh, a B.Tech (Computer Science and Engineering) student in Semester VII
> (session 2026–27) in the Department of Computer Science and Engineering, Harcourt Butler
> Technical University (HBTU), Kanpur. I am writing on behalf of my project team (Rajat Patel,
> Harshit Jain, Sanyam Jain and myself), supervised by Prof. (Dr.) Imran Khan, Professor,
> Department of CSE, HBTU Kanpur.
>
> For our final-year project, AgroMind, a crop
> recommendation system for Indian districts, we have used the district-wise, season-wise
> Area, Production & Yield (APY) statistics published on the DES Data Portal
> (https://data.desagri.gov.in/website/crops-apy-report-web), for all states and the crop
> years 1997-98 to 2022-23, as downloaded on 22 November 2026.
>
> As your Copyright Policy (https://desagri.gov.in/website-policies/) requires, we request
> permission to reproduce this material in:
>
> 1. our project report and a research paper submitted for academic review, as tables, figures
>    and summary statistics; and
> 2. the project's source repository, as a processed dataset (the APY figures joined with
>    public climate and soil data), for the examiners and reviewers to reproduce the results.
>
> The use is non-commercial. The figures are reproduced exactly as published, without
> alteration. Every place that uses them will carry this acknowledgement:
>
> *“Source: Directorate of Economics & Statistics, Department of Agriculture & Farmers
> Welfare, Ministry of Agriculture & Farmers Welfare, Government of India — Area, Production
> & Yield statistics, data.desagri.gov.in (accessed 22 November 2026).”*
>
> We would be grateful for your permission, or for guidance on any conditions you would like us
> to follow.
>
> Thank you for making these statistics available.
>
> Yours faithfully,
> Ravi Pratap Singh (Roll no. 230104047), on behalf of the AgroMind project team
> B.Tech CSE, Semester VII · Department of Computer Science and Engineering
> Harcourt Butler Technical University (HBTU), Kanpur
> Supervisor: Prof. (Dr.) Imran Khan, Professor, Dept. of CSE, HBTU Kanpur
> 230104047@hbtu.ac.in

---

## 2. To CACP (minimum support prices)

**To:** Office of the Member Secretary, Commission for Agricultural Costs & Prices,
184A, Krishi Bhawan, New Delhi 110001 — `ms-cacp@nic.in`
(listed at <https://cacp.da.gov.in/Home/Contactus>)

**Subject:** Request for permission to reproduce the MSP table in an academic project

> Dear Sir/Madam,
>
> I am Ravi Pratap Singh, a B.Tech (Computer Science and Engineering) student in Semester VII
> (session 2026–27) in the Department of Computer Science and Engineering, Harcourt Butler
> Technical University (HBTU), Kanpur. I am writing on behalf of my project team (Rajat Patel,
> Harshit Jain, Sanyam Jain and myself), supervised by Prof. (Dr.) Imran Khan, Professor,
> Department of CSE, HBTU Kanpur.
>
> Our final-year project, AgroMind, ranks crops for
> Indian districts. To consider farm income as well as yield, it uses the table “Minimum
> Support / Fair & Remunerative Prices Recommended by CACP and Fixed by Government (Crop
> Year)” published at https://cacp.da.gov.in/Home/MSP (crop years 2010-11 to 2026-27, as
> accessed on 23 November 2026).
>
> As your Website Policies (https://cacp.da.gov.in/Home/Privacy) require, we request
> permission to reproduce these prices in:
>
> 1. our project report and a research paper submitted for academic review; and
> 2. the project's source repository, as a small table of MSP / FRP by crop and crop year,
>    for the examiners and reviewers to reproduce the results.
>
> The use is non-commercial, and the prices are reproduced exactly as published. Every place
> that uses them will carry this acknowledgement:
>
> *“Source: Commission for Agricultural Costs & Prices, Department of Agriculture & Farmers
> Welfare, Ministry of Agriculture & Farmers Welfare, Government of India — cacp.da.gov.in
> (accessed 23 November 2026).”*
>
> We would be grateful for your permission, or for guidance on any conditions you would like us
> to follow.
>
> Yours faithfully,
> Ravi Pratap Singh (Roll no. 230104047), on behalf of the AgroMind project team
> B.Tech CSE, Semester VII · Department of Computer Science and Engineering
> Harcourt Butler Technical University (HBTU), Kanpur
> Supervisor: Prof. (Dr.) Imran Khan, Professor, Dept. of CSE, HBTU Kanpur
> 230104047@hbtu.ac.in

---

## After sending

| Agency | Sent on | Reply on | Outcome | Recorded in DATA_PROVENANCE.md |
|--------|---------|----------|---------|--------------------------------|
| DES | [date] | [date] | [granted / conditions / no reply] | [ ] |
| CACP | [date] | [date] | [granted / conditions / no reply] | [ ] |

If either declines, or has not replied by submission: keep the raw data out of the public
repository (the build script re-downloads it from the official sites), and cite the sources
in the paper as usual.
