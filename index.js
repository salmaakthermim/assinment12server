require('dotenv').config();
const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z4bua.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    const userCollection = client.db('bloodDb').collection('users');
    const donationRequestCollection = client.db('bloodDb').collection('donationRequests');
    const blogCollection = client.db('bloodDb').collection('blog');
    const donationCollection = client.db("bloodDb").collection("requests");
    const DonationRequest = client.db("bloodDb").collection("donation");

    // Register User Endpoint
    app.post('/register', async (req, res) => {
      try {
        const user = req.body;
        const { email, name, avatar, bloodGroup, district, upazila, password } = req.body;
        const query = { email: user.email };

        // Check if the user already exists
        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).send({ message: 'User already exists!' });
        }

        // Create a new user object
        const newUser = {
          email,
          name,
          avatar,
          bloodGroup,
          district,
          upazila,
          password,
          role: 'donor',
          status: 'active',
        };

        // Insert the new user into the database
        const result = await userCollection.insertOne(newUser);
        console.log('User registered successfully:', result);
        res.status(201).send({
          message: 'User registered successfully!',
          userId: result.insertedId,
        });
      } catch (error) {
        console.log('Error registering user:', error);
        res.status(500).send({
          message: 'An error occurred while registering the user.',
          error: error.message,
        });
      }
    });




    // Get users with filtering and pagination
    app.get('/users', async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.status) {
          filter.status = req.query.status;
        }

        const totalUsers = await userCollection.countDocuments(filter);
        const totalPages = Math.ceil(totalUsers / limit);

        const users = await userCollection
          .find(filter)
          .skip(skip)
          .limit(limit)
          .toArray();

        res.json({
          users,
          currentPage: page,
          totalPages,
          totalUsers
        });
      } catch (error) {
        res.status(500).json({ message: 'Error fetching users' });
      }
    });


    // Create Donation Request Endpoint
    app.post('/donation-requests', async (req, res) => {
      const {
        requesterName,
        requesterEmail,
        recipientName,
        recipientDistrict,
        recipientUpazila,
        hospitalName,
        fullAddress,
        bloodGroup,
        donationDate,
        donationTime,
        requestMessage,
      } = req.body;

      const requestingUser = await userCollection.findOne({ email: requesterEmail });

      if (!requestingUser || requestingUser.status === 'blocked') {
        return res.status(403).send({ message: 'Blocked users cannot create donation requests.' });
      }

      const newRequest = {
        requesterName,
        requesterEmail,
        recipientName,
        recipientDistrict,
        recipientUpazila,
        hospitalName,
        fullAddress,
        bloodGroup,
        donationDate,
        donationTime,
        requestMessage,
        donationStatus: 'pending',
        createdAt: new Date(),
      };

      const result = await donationRequestCollection.insertOne(newRequest);
      res.status(201).send({
        message: 'Donation request created successfully!',
        requestId: result.insertedId,
      });
    });

    app.get("/user-profile", async (req, res) => {
      const email = req.query.email;

      try {
        const user = await userCollection.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json(user);
      } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch user profile" });
      }
    });


    // Get 3 Recent Donation Requests for a Donor
    app.get('/recent-donation-requests', async (req, res) => {
      const { email } = req.query;

      if (!email) {
        return res.status(400).send({ message: 'User email is required' });
      }

      const user = await userCollection.findOne({ email });
      if (!user || user.role !== 'donor') {
        return res.status(403).send({ message: 'Unauthorized access' });
      }

      const recentRequests = await donationRequestCollection
        .find({ requesterEmail: email, })
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray();

      res.send(recentRequests);
    });

    // Fetch details of a specific donation request by ID
    app.get('/donation-requests/:id', async (req, res) => {
      const { id } = req.params;
      console.log('Request ID:', id)

      try {
        const requestDetails = await donationRequestCollection.findOne(id);
        if (requestDetails) {
          res.status(200).json(requestDetails);
        } else {
          res.status(404).json({ message: 'Donation request not found' });
        }
      } catch (error) {
        res.status(500).json({ message: 'Error fetching donation request details', error });
      }
    });

    // Update Donation Request Status
    app.patch('/donation-requests/:id/status', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      if (!['done', 'canceled'].includes(status)) {
        return res.status(400).send({ message: 'Invalid status update' });
      }

      const result = await donationRequestCollection.updateOne(
        { _id: new ObjectId(id), donationStatus: 'inprogress' },
        { $set: { donationStatus: status } }
      );

      if (result.matchedCount === 0) {
        const donationRequest = await donationRequestCollection.findOne({ _id: new ObjectId(id) });
        if (!donationRequest) {
          return res.status(404).send({ message: 'Donation request not found' });
        }
        return res.status(400).send({ message: 'Cannot update donation request in current status' });
      }

      res.send({ message: 'Donation request updated successfully' });
    });

    // Delete Donation Request
    app.delete('/donation-requests/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }

      const result = await donationRequestCollection.deleteOne(query);

      if (result.deletedCount === 0) {
        return res.status(404).send({ message: 'Donation request not found' });
      }

      res.send({ message: 'Donation request deleted successfully' });
    });


    app.get('/my-donation-requests', async (req, res) => {
      try {
        const { email, status, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        // Build query
        const query = { requesterEmail: email };
        if (status) {
          query.donationStatus = status;
        }

        // Get total count for pagination
        const total = await donationRequestCollection.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        // Fetch donations with pagination
        const donations = await donationRequestCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        res.json({
          donations,
          currentPage: parseInt(page),
          totalPages,
          total
        });

      } catch (error) {
        console.error('Error fetching donation requests:', error);
        res.status(500).json({
          message: 'Error fetching donation requests',
          error: error.message
        });
      }
    });




    // Dashboard Statistics Endpoint
    app.get('/dashboard-statistics', async (req, res) => {
      try {
        const totalUsers = await userCollection.countDocuments();
        const totalRequests = await donationRequestCollection.countDocuments();
        const totalFunding = await donationCollection.aggregate([
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]).toArray();

        res.send({
          totalUsers,
          totalRequests,
          totalFunding: totalFunding[0]?.total || 0,
        });
      } catch (error) {
        console.error('Failed to fetch statistics:', error);
        res.status(500).send({ message: 'Failed to fetch statistics', error });
      }
    });
    // Get All Users with Pagination and Filtering
    app.get("/users", async (req, res) => {
      try {
        const { status, page = 1, limit = 10 } = req.query;

        const query = status ? { status } : {};
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const totalUsers = await userCollection.countDocuments(query);
        const users = await userCollection
          .find(query)
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        res.send({
          totalUsers,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalUsers / limit),
          users,
        });
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch users", error });
      }
    });

    // Update user status
    app.patch('/users/:id/status', async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'Status updated successfully' });
      } catch (error) {
        res.status(500).json({ message: 'Error updating status' });
      }
    });

    // Update user role
    app.patch('/users/:id/role', async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'Role updated successfully' });
      } catch (error) {
        res.status(500).json({ message: 'Error updating role' });
      }
    });


    // All Blood Donation Request


    app.get('/all-donation-requests', async (req, res) => {
      const { page = 1, limit = 10, status } = req.query;

      try {
        const query = {};
        if (status) {
          query.donationStatus = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const totalRequests = await donationRequestCollection.countDocuments(query);
        const requests = await donationRequestCollection
          .find(query)
          .sort({ createdAt: -1 }) // Sort by most recent
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        res.send({
          totalRequests,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalRequests / limit),
          requests,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to fetch donation requests' });
      }
    });

    app.patch('/donation-requests/:id/status', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      if (!['done', 'canceled', 'pending', 'inprogress'].includes(status)) {
        return res.status(400).send({ message: 'Invalid status update' });
      }

      try {
        const result = await donationRequestCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { donationStatus: status } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'Donation request not found' });
        }

        res.send({ message: 'Donation request status updated successfully' });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to update donation request status' });
      }
    });

    app.delete('/donation-requests/:id', async (req, res) => {
      const { id } = req.params;

      try {
        const result = await donationRequestCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: 'Donation request not found' });
        }

        res.send({ message: 'Donation request deleted successfully' });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to delete donation request' });
      }
    });



    // Create a new blog
    app.post('/content-management/blog', async (req, res) => {
      const { title, thumbnail, content, createdBy } = req.body;

      try {
        const newBlog = {
          title,
          thumbnail,
          content,
          createdBy,
          status: 'draft',
          createdAt: new Date(),
        };

        const result = await blogCollection.insertOne(newBlog);
        res.status(201).send({
          message: 'Blog created successfully',
          blogId: result.insertedId,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to create blog' });
      }
    });

    // Get all blogs with optional filtering
    app.get('/content-management/blogs', async (req, res) => {
      const { status } = req.query;

      try {
        const query = status ? { status } : {};
        const blogs = await blogCollection.find(query).toArray();
        res.send(blogs);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to fetch blogs' });
      }
    });

    // Publish a blog (only admin can do this)
    app.patch('/content-management/blogs/:id/publish', async (req, res) => {
      const { id } = req.params;

      try {
        const result = await blogCollection.updateOne(
          { _id: new ObjectId(id), status: 'draft' },
          { $set: { status: 'published' } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'Blog not found or already published' });
        }

        res.send({ message: 'Blog published successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to publish blog' });
      }
    });

    // Unpublish a blog (only admin can do this)
    app.patch('/content-management/blogs/:id/unpublish', async (req, res) => {
      const { id } = req.params;

      try {
        const result = await blogCollection.updateOne(
          { _id: new ObjectId(id), status: 'published' },
          { $set: { status: 'draft' } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'Blog not found or already unpublished' });
        }

        res.send({ message: 'Blog unpublished successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to unpublish blog' });
      }
    });

    // Fetch details of a specific donation request by ID
    app.get('/content-management/blogs/:id', async (req, res) => {
      const { id } = req.params;


      try {
        const requestDetails = await blogCollection.findOne({ _id: new ObjectId(id) });
        if (requestDetails) {
          res.status(200).json(requestDetails);
        } else {
          res.status(404).json({ message: 'blog request not found' });
        }
      } catch (error) {
        res.status(500).json({ message: 'Error fetching blog request details', error });
      }
    });

    app.put('/content-management/blogs/:id', async (req, res) => {
      const { id } = req.params;
      const { title, thumbnail, content, createdBy } = req.body;

      try {
        const result = await blogCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              title,
              thumbnail,
              content,
              createdBy,
              updatedAt: new Date()
            }
          }
        );

        if (result.modifiedCount > 0) {
          res.status(200).send({ message: 'Blog updated successfully' });
        } else {
          res.status(404).send({ message: 'Blog not found' });
        }
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to update blog' });
      }
    });


    // Delete a blog (only admin can do this)
    app.delete('/content-management/blogs/:id', async (req, res) => {
      const { id } = req.params;

      try {
        const result = await blogCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: 'Blog not found' });
        }

        res.send({ message: 'Blog deleted successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to delete blog' });
      }
    });





    // Get all pending donation requests
    app.get('/pending', async (req, res) => {
      try {

        const requests = await donationRequestCollection.find({
          donationStatus: 'pending'
        }).toArray();
        res.status(200).json(requests);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch donation requests' });
      }
    });

    // Get a specific donation request by ID
    app.get("/donation-requests/:id", async (req, res) => {
      try {
        const { id } = req.params;
        console.log('Request ID:', id)
        const request = await donationRequestCollection.findOne({ _id: new ObjectId(id) });
        if (request) {
          res.send(request);
        } else {
          res.status(404).send({ message: "Donation request not found." });
        }
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch the donation request.", error });
      }
    });




    // Middleware to check if the user is a volunteer
    const isVolunteer = (req, res, next) => {
      if (req.user.role !== "volunteer") {
        return res.status(403).json({ message: "Access denied" });
      }
      next();
    };

    //     // Get donation request details by ID
    // app.get("/donation-requests/:id", async (req, res) => {
    //   try {
    //     const donationRequest = await donationRequestCollection.findById(req.params.id);
    //     if (!donationRequest) {
    //       return res.status(404).json({ message: "Donation request not found" });
    //     }
    //     res.status(200).json(donationRequest);
    //   } catch (error) {
    //     res.status(500).json({ message: "Server error", error });
    //   }
    // });

    // Update donation request status
    app.patch("donation-requests/:id/status", async (req, res) => {
      try {
        const { status } = req.body;
        const donationRequest = await donationRequestCollection.findById(req.params.id);

        if (!donationRequest) {
          return res.status(404).json({ message: "Donation request not found" });
        }

        donationRequest.status = status;
        await donationRequest.save();
        res.status(200).json({ message: "Status updated successfully", donationRequest });
      } catch (error) {
        res.status(500).json({ message: "Server error", error });
      }
    });






    // get single user with user email
    app.get('/user/:email', async (req, res) => {
      const { email } = req.params;

      try {
        const result = await userCollection.findOne({ email: email });



        res.send({ message: 'get user success', data: result });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to get user' });
      }
    });



    console.log('Connected to MongoDB successfully!');
  } finally {
    // Uncomment this line to close the connection when the server stops
    // await client.close();
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});










