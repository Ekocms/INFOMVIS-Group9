Naturvation Decision Support Tool
===============================

Overview
--------
This project is an interactive visual analytics dashboard for exploring Nature-based Solutions (NbS) projects from the Naturvation dataset. It is designed to support researchers, practitioners, and policy analysts in exploring, filtering, and comparing NbS projects across multiple dimensions.

The tool allows users to:
- Explore where NbS projects are located globally
- Understand how challenges addressed map to different NbS types
- See distributions of NbS types and project statuses
- Filter projects dynamically across all views
- Compare up to three projects side-by-side using aligned attributes

Visualisations
--------------

1. Projects by Continent (Map)
- Displays the number of projects per continent
- Clicking a continent filters all other views
- Supports zooming and resetting

2. Challenge to NbS Type (Sankey Diagram)
- Shows relationships between challenges addressed and NbS types
- Projects may contribute to multiple links
- Node order remains fixed to preserve mental mapping during filtering

3. Projects by NbS Type (Bar Chart)
- Shows the number of projects that include each NbS type
- Projects may appear in multiple bars
- Clicking a bar or label filters all views
- Includes an information pop-up explaining how to interpret the chart

4. Project Status (Donut Chart)
- Shows the distribution of project statuses
- Clicking a segment filters all views
- Non-selected segments are visually muted to preserve context

Filters
-------
Users can filter projects by:
- Country
- NbS Type
- Challenge addressed
- Project status

Active filters are displayed to support transparency and user understanding.

Comparison Feature
------------------
Users can add up to three projects to a comparison basket.

Comparison design characteristics:
- Projects are displayed side-by-side
- Rows are aligned across projects to support easy comparison
- Attributes include status, challenges addressed, NbS types, cost, location, and source
- Projects can be removed individually from the comparison

Design Rationale
----------------
Key design principles applied in this tool include:
- Coordinated multiple views: interactions in one view update all others
- Context preservation: non-selected elements are muted rather than removed
- Stable layouts: visual order remains consistent during filtering
- Explainability: tooltips and information pop-ups support novice users
- Comparability: aligned rows reduce cognitive load during comparison

File Structure
--------------

index.html
    Main HTML structure of the dashboard

style.css
    Styling and layout definitions

app.js
    Data loading, state management, and interaction logic

data/nbs_clean.csv
    Processed Naturvation dataset

How to Run
----------
This project must be run via a local web server in order to load the CSV data correctly.

Example using Python:

    python -m http.server 8080

Then open a browser and navigate to:

    http://localhost:8080/Template1

Notes
-----
- A single project can belong to multiple NbS types and challenges
- Counts in the bar chart and Sankey diagram reflect this multiplicity
- Some projects may have missing or grouped location information

Project Status
--------------
This dashboard was developed as part of an academic assignment and was iteratively refined based on user feedback.
